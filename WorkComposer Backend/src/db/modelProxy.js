import { isMongo, isPostgres } from "./index.js";
import { getAmbientTransaction } from "./transaction.js";
import { generateId } from "../utils/idGenerator.js";
import { serializeApiResponse } from "../utils/serializeApiResponse.js";

function applyProjection(doc, selectStr) {
  if (!doc || typeof doc !== "object") return doc;
  if (!selectStr || typeof selectStr !== "string") return doc;

  const fields = selectStr.trim().split(/\s+/).filter(Boolean);
  if (fields.length === 0) return doc;
  const isExclusion = fields.some((f) => f.startsWith("-"));

  if (isExclusion) {
    const excluded = fields.filter((f) => f.startsWith("-")).map((f) => f.slice(1));
    for (const key of excluded) {
      delete doc[key];
    }
  } else {
    const included = new Set(fields.filter((f) => !f.startsWith("-")));
    included.add("_id");
    included.add("id");
    for (const key of Object.keys(doc)) {
      if (!included.has(key) && typeof doc[key] !== "function") {
        delete doc[key];
      }
    }
  }
  return doc;
}

/**
 * Attaches a compatibility `.session(session)` method to a Promise so that legacy Mongoose
 * transaction session chaining (e.g., `Model.deleteMany(...).session(session)`) does not throw
 * TypeError in PostgreSQL mode. Returns the same promise for seamless awaiting or chaining.
 */
export function attachSessionCompat(promise) {
  if (promise && typeof promise.then === "function") {
    promise.session = function (sess) {
      return promise;
    };
  }
  return promise;
}

/**
 * ChainableQuery simulates Mongoose Query chaining for Prisma-backed repositories:
 * Supports: .select(), .populate(), .sort(), .skip(), .limit(), .lean(), .exec(), await query
 */
export class ChainableQuery {
  constructor(queryFn, repo = null, initialOptions = {}) {
    this._queryFn = queryFn;
    this._repo = repo;
    this._options = { ...initialOptions };
  }

  select(fields) {
    this._options.select = fields;
    return this;
  }

  populate(path, select) {
    if (!this._options.populate) {
      this._options.populate = [];
    }
    if (typeof path === "string") {
      this._options.populate.push({ path, select });
      // Also set convenience flags like populateOrganization, populateTeam, etc.
      const cap = path.charAt(0).toUpperCase() + path.slice(1);
      this._options[`populate${cap}`] = true;
    } else if (typeof path === "object" && path !== null) {
      this._options.populate.push(path);
      if (path.path) {
        const cap = path.path.charAt(0).toUpperCase() + path.path.slice(1);
        this._options[`populate${cap}`] = true;
      }
    }
    return this;
  }

  sort(sortCriteria) {
    this._options.sort = sortCriteria;
    return this;
  }

  skip(count) {
    this._options.skip = Number(count);
    return this;
  }

  limit(count) {
    this._options.limit = Number(count);
    return this;
  }

  lean() {
    this._options.lean = true;
    return this;
  }

  session(session) {
    this._options.session = session;
    return this;
  }

  exec() {
    return this.then();
  }

  then(onFulfilled, onRejected) {
    const promise = Promise.resolve(this._queryFn(this._options)).then((result) => {
      let wrapped = wrapResult(result, this._repo);

      // Apply populated relation projections if specified
      if (Array.isArray(this._options.populate)) {
        for (const pop of this._options.populate) {
          if (pop && pop.path && (pop.select || pop.populate)) {
            const nestedPaths = [];
            if (pop.populate) {
              const nestedList = Array.isArray(pop.populate) ? pop.populate : [pop.populate];
              for (const n of nestedList) {
                if (typeof n === "string") nestedPaths.push(n);
                else if (n && n.path) nestedPaths.push(n.path);
              }
            }
            const effectiveSelect = pop.select && typeof pop.select === "string"
              ? (nestedPaths.length > 0 && !pop.select.startsWith("-") ? `${pop.select} ${nestedPaths.join(" ")}` : pop.select)
              : null;

            const applyPop = (item) => {
              if (!item) return;
              const targets = Array.isArray(item[pop.path])
                ? item[pop.path]
                : item[pop.path] && typeof item[pop.path] === "object"
                ? [item[pop.path]]
                : [];
              for (const sub of targets) {
                if (effectiveSelect) {
                  applyProjection(sub, effectiveSelect);
                }
                if (pop.populate) {
                  const nestedList = Array.isArray(pop.populate) ? pop.populate : [pop.populate];
                  for (const n of nestedList) {
                    if (n && typeof n === "object" && n.path && n.select) {
                      if (sub[n.path] && typeof sub[n.path] === "object") {
                        applyProjection(sub[n.path], n.select);
                      }
                    }
                  }
                }
              }
            };
            if (Array.isArray(wrapped)) {
              wrapped.forEach(applyPop);
            } else if (wrapped && typeof wrapped === "object") {
              applyPop(wrapped);
            }
          }
        }
      }

      // Apply root query select projections if specified
      if (this._options.select) {
        if (Array.isArray(wrapped)) {
          wrapped.forEach((item) => applyProjection(item, this._options.select));
        } else if (wrapped && typeof wrapped === "object") {
          applyProjection(wrapped, this._options.select);
        }
      }

      if (Array.isArray(wrapped) && !this._repo) {
        if (this._options.skip && this._options.skip > 0) {
          wrapped = wrapped.slice(this._options.skip);
        }
        if (this._options.limit !== undefined && this._options.limit !== null && this._options.limit >= 0) {
          wrapped = wrapped.slice(0, this._options.limit);
        }
      }
      return wrapped;
    });
    return promise.then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this.then(null, onRejected);
  }

  finally(onFinally) {
    return this.then(
      (val) => {
        onFinally();
        return val;
      },
      (err) => {
        onFinally();
        throw err;
      }
    );
  }
}

/**
 * Wraps repository output documents to provide Mongoose document method compatibility:
 * .save(), .toObject(), .toJSON(), .isModified()
 */
export function wrapDocument(doc, repo = null) {
  if (!doc || typeof doc !== "object") return doc;
  if (Array.isArray(doc)) return doc.map((d) => wrapDocument(d, repo));

  // Ensure _id and id are synchronized 24-hex strings
  if (doc.id && !doc._id) doc._id = String(doc.id);
  if (doc._id && !doc.id) doc.id = String(doc._id);

  // Recursively wrap nested objects so populated relations also get .toObject()
  for (const [key, val] of Object.entries(doc)) {
    if (val && typeof val === "object" && !(val instanceof Date) && !Array.isArray(val) && typeof val.toObject !== "function") {
      wrapDocument(val, null);
    }
  }

  if (!doc.toObject) {
    doc.toObject = function () {
      const obj = { ...this };
      delete obj.save;
      delete obj.toObject;
      delete obj.toJSON;
      delete obj.isModified;
      delete obj.isNew;
      delete obj._isNew;
      return obj;
    };
  }

  if (!doc.toJSON) {
    doc.toJSON = function () {
      return this.toObject();
    };
  }

  if (!doc.isModified) {
    doc.isModified = function () {
      return false;
    };
  }

  if (doc.isNew === undefined) {
    Object.defineProperty(doc, "isNew", {
      value: false,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  } else {
    const existingVal = Boolean(doc.isNew);
    Object.defineProperty(doc, "isNew", {
      value: existingVal,
      writable: true,
      enumerable: false,
      configurable: true,
    });
  }

  if (!doc.save) {
    doc.save = function () {
      const promise = (async () => {
        if (!repo) {
          throw new Error("Document save failed: repository is not defined in PostgreSQL mode.");
        }

        const cleanData = typeof this.toObject === "function" ? this.toObject() : { ...this };

        // If the document is newly instantiated, route to repo.create
        if (this.isNew) {
          if (typeof repo.create === "function") {
            const created = await repo.create(cleanData);
            if (created && typeof created === "object") {
              Object.assign(this, created);
            }
            this.isNew = false;
            return this;
          }
          const modelName = repo?.modelName || (this.constructor && this.constructor.modelName) || "Unknown";
          throw new Error(
            `Document save (create) is not supported for model '${modelName}' in PostgreSQL mode.`
          );
        }

        // For existing documents, require a valid identifier
        const docId = this._id || this.id || cleanData._id || cleanData.id;
        let normalizedId = null;
        if (docId !== null && docId !== undefined) {
          if (typeof docId === "string") {
            normalizedId = docId.trim();
          } else if (typeof docId === "object") {
            if (typeof docId.toHexString === "function") {
              normalizedId = docId.toHexString();
            } else if (typeof docId.toString === "function" && docId.toString !== Object.prototype.toString) {
              const str = docId.toString().trim();
              if (str !== "[object Object]") normalizedId = str;
            }
          } else if (typeof docId === "number" && !isNaN(docId)) {
            normalizedId = String(docId);
          }
        }

        if (!normalizedId) {
          const modelName = repo?.modelName || (this.constructor && this.constructor.modelName) || "Unknown";
          throw new Error(
            `Cannot save document without a valid identifier for model '${modelName}' in PostgreSQL mode.`
          );
        }

        // Prepare update payload excluding immutable primary key and system fields
        const updatePayload = { ...cleanData };
        delete updatePayload._id;
        delete updatePayload.id;
        delete updatePayload.createdAt;
        delete updatePayload.updatedAt;
        delete updatePayload.isNew;
        delete updatePayload._isNew;
        delete updatePayload.save;
        delete updatePayload.toObject;
        delete updatePayload.toJSON;
        delete updatePayload.isModified;

        let updated = null;
        if (typeof repo.updateById === "function") {
          updated = await repo.updateById(normalizedId, updatePayload);
        } else if (typeof repo.updateOne === "function") {
          updated = await repo.updateOne({ _id: normalizedId }, updatePayload);
        } else if (typeof repo.findByIdAndUpdate === "function") {
          updated = await repo.findByIdAndUpdate(normalizedId, updatePayload, { new: true });
        } else if (typeof repo.findOneAndUpdate === "function") {
          updated = await repo.findOneAndUpdate({ _id: normalizedId }, updatePayload, { new: true });
        } else {
          const modelName = repo?.modelName || (this.constructor && this.constructor.modelName) || "Unknown";
          throw new Error(
            `Document save is not supported for model '${modelName}' in PostgreSQL mode.`
          );
        }

        if (updated && typeof updated === "object" && (updated._id || updated.id)) {
          Object.assign(this, updated);
        }

        return this;
      })();
      return attachSessionCompat(promise);
    };
  }

  if (!doc.deleteOne) {
    doc.deleteOne = function () {
      const promise = (async () => {
        const modelName = repo?.modelName || (this.constructor && this.constructor.modelName) || "Unknown";
        if (!repo) {
          throw new Error(`Document deleteOne failed: repository is not defined for model '${modelName}' in PostgreSQL mode.`);
        }

        const rawId = this._id || this.id;
        let normalizedId = null;
        if (rawId !== null && rawId !== undefined) {
          if (typeof rawId === "string") {
            normalizedId = rawId.trim();
          } else if (typeof rawId === "object") {
            if (typeof rawId.toHexString === "function") {
              normalizedId = rawId.toHexString();
            } else if (typeof rawId.toString === "function" && rawId.toString !== Object.prototype.toString) {
              const str = rawId.toString().trim();
              if (str !== "[object Object]") normalizedId = str;
            }
          } else if (typeof rawId === "number" && !isNaN(rawId)) {
            normalizedId = String(rawId);
          }
        }

        if (!normalizedId) {
          throw new Error(
            `Cannot delete document without a valid identifier for model '${modelName}' in PostgreSQL mode.`
          );
        }

        if (typeof repo.findByIdAndDelete === "function") return await repo.findByIdAndDelete(normalizedId);
        if (typeof repo.deleteById === "function") return await repo.deleteById(normalizedId);
        if (typeof repo.deleteOne === "function") return await repo.deleteOne({ _id: normalizedId });

        throw new Error(
          `Document deleteOne is not supported for model '${modelName}' in PostgreSQL mode.`
        );
      })();
      return attachSessionCompat(promise);
    };
  }

  return doc;
}

function wrapResult(result, repo) {
  if (result === null || result === undefined) return result;
  if (Array.isArray(result)) {
    return result.map((item) => wrapDocument(item, repo));
  }
  if (typeof result === "object") {
    return wrapDocument(result, repo);
  }
  return result;
}

/**
 * Creates a model proxy that routes to Mongoose when DATABASE_PROVIDER=mongo,
 * and routes to the domain repository when DATABASE_PROVIDER=postgres.
 *
 * @param {object} mongooseModel The native Mongoose model
 * @param {function} getRepository Lazy resolver returning the domain repository
 */
export function createModelProxy(mongooseModel, getRepository) {
  return new Proxy(mongooseModel, {
    construct(target, args) {
      if (!isPostgres()) {
        return Reflect.construct(target, args);
      }
      const repo = getRepository ? getRepository() : null;
      const initialData = args[0] || {};
      const doc = {
        _id: initialData._id || generateId(),
        id: initialData._id || initialData.id || generateId(),
        ...initialData,
      };
      Object.defineProperty(doc, "isNew", {
        value: true,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      return wrapDocument(doc, repo);
    },

    get(target, prop, receiver) {
      // If Mongo mode, passthrough 100% to native Mongoose model
      // but propagate active ambient transaction session for create/insertMany
      if (!isPostgres()) {
        if (prop === "create") {
          const session = typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null;
          if (session && isMongo()) {
            return (...docs) => {
              if (docs.length === 0) return target.create();
              const lastArg = docs[docs.length - 1];
              if (docs.length > 1 && lastArg && typeof lastArg === "object" && lastArg.session) {
                return target.create(...docs);
              }
              if (docs.length === 2 && Array.isArray(docs[0])) {
                if (lastArg && typeof lastArg === "object" && !Array.isArray(lastArg)) {
                  return target.create(docs[0], { ...lastArg, session });
                }
                if (lastArg === undefined) {
                  return target.create(docs[0], { session });
                }
              }
              if (docs.length === 1 && Array.isArray(docs[0])) {
                return target.create(docs[0], { session });
              }
              if (docs.length === 1) {
                return target.create([docs[0]], { session }).then((res) => (Array.isArray(res) ? res[0] : res));
              }
              return target.create(docs, { session });
            };
          }
        }
        if (prop === "insertMany") {
          const session = typeof getAmbientTransaction === "function" ? getAmbientTransaction() : null;
          if (session && isMongo()) {
            return (docs, options = {}) => {
              const opts = { ...options };
              if (!opts.session) opts.session = session;
              return target.insertMany(docs, opts);
            };
          }
        }
        return Reflect.get(target, prop, receiver);
      }

      const repo = getRepository ? getRepository() : null;
      if (!repo) {
        return Reflect.get(target, prop, receiver);
      }

      switch (prop) {
        case "findById":
          return (id, projection, options) => {
            return new ChainableQuery(
              (queryOptions) => repo.findById(id, { ...options, ...queryOptions }),
              repo
            );
          };

        case "findOne":
          return (filter = {}, projection, options) => {
            return new ChainableQuery(
              (queryOptions) => repo.findOne(filter, { ...options, ...queryOptions }),
              repo
            );
          };

        case "find":
          return (filter = {}, projection, options) => {
            return new ChainableQuery(
              (queryOptions) => repo.find(filter, { ...options, ...queryOptions }),
              repo
            );
          };

        case "countDocuments":
          return (filter = {}) => {
            return new ChainableQuery(
              (queryOptions) => {
                if (repo.countDocuments) {
                  return repo.countDocuments(filter, queryOptions);
                }
                return repo.find(filter, queryOptions).then((res) => (res ? res.length : 0));
              },
              repo
            );
          };

        case "estimatedDocumentCount":
          return () => {
            return new ChainableQuery(
              () => {
                if (repo.countDocuments) {
                  return repo.countDocuments({});
                }
                return repo.find({}).then((res) => (res ? res.length : 0));
              },
              repo
            );
          };

        case "create":
          return (...docs) => {
            const promise = (async () => {
              const data = docs.length === 1 && Array.isArray(docs[0]) ? docs[0] : docs;
              if (Array.isArray(data) && docs.length === 1 && Array.isArray(docs[0])) {
                const created = [];
                for (const item of data) {
                  created.push(await repo.create(item));
                }
                return wrapResult(created, repo);
              }
              const single = docs[0];
              const result = await repo.create(single);
              return wrapResult(result, repo);
            })();
            return attachSessionCompat(promise);
          };

        case "insertMany":
          return (docs) => {
            const promise = (async () => {
              const created = [];
              for (const item of docs) {
                created.push(await repo.create(item));
              }
              return wrapResult(created, repo);
            })();
            return attachSessionCompat(promise);
          };

        case "updateOne":
          return (filter, update, options) => {
            const promise = (async () => {
              if (typeof repo.updateOne === "function") return await repo.updateOne(filter, update, options);
              if (typeof repo.findOneAndUpdate === "function") return await repo.findOneAndUpdate(filter, update, options);
              const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
              throw new Error(
                `updateOne is not supported for model '${modelName}' in PostgreSQL mode.`
              );
            })();
            return attachSessionCompat(promise);
          };

        case "updateMany":
          return (filter, update, options) => {
            const promise = (async () => {
              if (typeof repo.updateMany === "function") return await repo.updateMany(filter, update, options);
              const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
              throw new Error(
                `updateMany is not supported for model '${modelName}' in PostgreSQL mode.`
              );
            })();
            return attachSessionCompat(promise);
          };

        case "findByIdAndUpdate":
          return (id, update, options) => {
            return new ChainableQuery(
              (queryOptions) => {
                const mergedOptions = { ...options, ...queryOptions };
                if (typeof repo.findByIdAndUpdate === "function") {
                  return repo.findByIdAndUpdate(id, update, mergedOptions);
                }
                if (typeof repo.updateById === "function") {
                  return repo.updateById(id, update, mergedOptions);
                }
                const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
                throw new Error(
                  `findByIdAndUpdate is not supported for model '${modelName}' in PostgreSQL mode.`
                );
              },
              repo
            );
          };

        case "findOneAndUpdate":
          return (filter, update, options) => {
            return new ChainableQuery(
              (queryOptions) => {
                const mergedOptions = { ...options, ...queryOptions };
                if (typeof repo.findOneAndUpdate === "function") {
                  return repo.findOneAndUpdate(filter, update, mergedOptions);
                }
                const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
                throw new Error(
                  `findOneAndUpdate is not supported for model '${modelName}' in PostgreSQL mode.`
                );
              },
              repo
            );
          };

        case "findByIdAndDelete":
          return (id, options) => {
            const promise = (async () => {
              if (typeof repo.findByIdAndDelete === "function") {
                return wrapResult(await repo.findByIdAndDelete(id, options), repo);
              }
              if (typeof repo.deleteById === "function") {
                return wrapResult(await repo.deleteById(id, options), repo);
              }
              const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
              throw new Error(
                `findByIdAndDelete is not supported for model '${modelName}' in PostgreSQL mode.`
              );
            })();
            return attachSessionCompat(promise);
          };

        case "findOneAndDelete":
          return (filter, options) => {
            const promise = (async () => {
              if (typeof repo.findOneAndDelete === "function") {
                return wrapResult(await repo.findOneAndDelete(filter, options), repo);
              }
              // Single-record fallback: only if filter targets a single record by ID and a single-record ID deletion method exists
              const filterKeys = filter && typeof filter === "object" ? Object.keys(filter) : [];
              if (filterKeys.length === 1 && (filter._id || filter.id)) {
                const idVal = filter._id || filter.id;
                let idStr = null;
                if (typeof idVal === "string") {
                  idStr = idVal.trim();
                } else if (typeof idVal === "object" && idVal !== null) {
                  if (typeof idVal.toHexString === "function") idStr = idVal.toHexString();
                  else if (typeof idVal.toString === "function" && idVal.toString !== Object.prototype.toString) {
                    const str = idVal.toString().trim();
                    if (str !== "[object Object]") idStr = str;
                  }
                }
                if (idStr) {
                  if (typeof repo.findByIdAndDelete === "function") {
                    return wrapResult(await repo.findByIdAndDelete(idStr, options), repo);
                  }
                  if (typeof repo.deleteById === "function") {
                    return wrapResult(await repo.deleteById(idStr, options), repo);
                  }
                }
              }
              const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
              throw new Error(
                `findOneAndDelete is not supported for model '${modelName}' in PostgreSQL mode.`
              );
            })();
            return attachSessionCompat(promise);
          };

        case "deleteOne":
          return (filter, options) => {
            const promise = (async () => {
              if (typeof repo.deleteOne === "function") return await repo.deleteOne(filter, options);
              // Single-record fallback: only if filter targets a single record by ID and a single-record ID deletion method exists
              const filterKeys = filter && typeof filter === "object" ? Object.keys(filter) : [];
              if (filterKeys.length === 1 && (filter._id || filter.id)) {
                const idVal = filter._id || filter.id;
                let idStr = null;
                if (typeof idVal === "string") {
                  idStr = idVal.trim();
                } else if (typeof idVal === "object" && idVal !== null) {
                  if (typeof idVal.toHexString === "function") idStr = idVal.toHexString();
                  else if (typeof idVal.toString === "function" && idVal.toString !== Object.prototype.toString) {
                    const str = idVal.toString().trim();
                    if (str !== "[object Object]") idStr = str;
                  }
                }
                if (idStr) {
                  if (typeof repo.findByIdAndDelete === "function") {
                    const doc = await repo.findByIdAndDelete(idStr, options);
                    return { acknowledged: true, deletedCount: doc ? 1 : 0 };
                  }
                  if (typeof repo.deleteById === "function") {
                    const doc = await repo.deleteById(idStr, options);
                    return { acknowledged: true, deletedCount: doc ? 1 : 0 };
                  }
                }
              }
              const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
              throw new Error(
                `deleteOne is not supported for model '${modelName}' in PostgreSQL mode.`
              );
            })();
            return attachSessionCompat(promise);
          };

        case "deleteMany":
          return (filter, options) => {
            const promise = (async () => {
              if (repo && typeof repo.deleteMany === "function") {
                return await repo.deleteMany(filter, options);
              }
              const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
              throw new Error(
                `deleteMany is not supported for model '${modelName}' in PostgreSQL mode.`
              );
            })();
            return attachSessionCompat(promise);
          };

        case "aggregate":
          return (pipeline) => {
            return new ChainableQuery(
              async () => {
                if (repo && typeof repo.aggregate === "function") {
                  return await repo.aggregate(pipeline);
                }
                const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
                throw new Error(
                  `Aggregation is not supported for model '${modelName}' in PostgreSQL mode.`
                );
              },
              repo
            );
          };

        case "distinct":
          return (field, filter) => {
            return new ChainableQuery(
              async () => {
                if (typeof repo.distinct === "function") return await repo.distinct(field, filter);
                const modelName = repo?.modelName || target.modelName || target.name || "Unknown";
                throw new Error(
                  `distinct is not supported for model '${modelName}' in PostgreSQL mode.`
                );
              },
              repo
            );
          };

        case "exists":
          return (filter) => {
            const promise = (async () => {
              if (repo.exists) return await repo.exists(filter);
              const doc = await repo.findOne(filter);
              return doc ? { _id: doc._id } : null;
            })();
            return attachSessionCompat(promise);
          };

        default:
          return Reflect.get(target, prop, receiver);
      }
    },
  });
}

export default createModelProxy;
