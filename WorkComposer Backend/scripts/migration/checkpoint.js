import fs from "fs";
import path from "path";
import config from "./config.js";
import logger from "./logger.js";

/**
 * Resumability Checkpoint Manager
 * Tracks per-model progress, last processed ObjectId, processed/inserted counts, and errors.
 */
export class CheckpointManager {
  constructor(filePath = config.checkpointFile) {
    this.filePath = filePath;
    this.state = {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      models: {},
      completedModels: [],
    };
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf8");
        this.state = JSON.parse(raw);
        logger.debug(`Loaded migration checkpoint from ${this.filePath}`);
      }
    } catch (err) {
      logger.warn(`Failed to read checkpoint file (${err.message}). Starting with fresh state.`);
    }
  }

  save() {
    try {
      this.state.updatedAt = new Date().toISOString();
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
    } catch (err) {
      logger.error(`Failed to save checkpoint to ${this.filePath}`, err);
    }
  }

  getModelCheckpoint(modelName) {
    if (!this.state.models[modelName]) {
      this.state.models[modelName] = {
        model: modelName,
        status: "pending", // 'pending' | 'in_progress' | 'completed' | 'failed'
        lastProcessedId: null,
        recordsProcessed: 0,
        recordsInserted: 0,
        recordsSkipped: 0,
        recordsNormalized: 0,
        orphanCount: 0,
        errors: [],
        startedAt: null,
        completedAt: null,
        updatedAt: new Date().toISOString(),
      };
    }
    return this.state.models[modelName];
  }

  startModel(modelName) {
    const cp = this.getModelCheckpoint(modelName);
    if (cp.status !== "completed") {
      cp.status = "in_progress";
      if (!cp.startedAt) {
        cp.startedAt = new Date().toISOString();
      }
      this.save();
    }
    return cp;
  }

  updateModelCheckpoint(modelName, updates) {
    const cp = this.getModelCheckpoint(modelName);
    if (updates.lastProcessedId !== undefined) {
      cp.lastProcessedId = updates.lastProcessedId;
    }
    if (updates.processed) cp.recordsProcessed += updates.processed;
    if (updates.inserted) cp.recordsInserted += updates.inserted;
    if (updates.skipped) cp.recordsSkipped += updates.skipped;
    if (updates.normalized) cp.recordsNormalized += updates.normalized;
    if (updates.orphans) cp.orphanCount += updates.orphans;
    if (updates.error) {
      cp.errors.push({
        message: updates.error.message || String(updates.error),
        timestamp: new Date().toISOString(),
      });
    }
    cp.updatedAt = new Date().toISOString();
    this.save();
    return cp;
  }

  markModelCompleted(modelName, finalStats = {}) {
    const cp = this.getModelCheckpoint(modelName);
    cp.status = "completed";
    cp.completedAt = new Date().toISOString();
    cp.updatedAt = new Date().toISOString();
    if (finalStats.processed !== undefined) cp.recordsProcessed = finalStats.processed;
    if (finalStats.inserted !== undefined) cp.recordsInserted = finalStats.inserted;
    if (!this.state.completedModels.includes(modelName)) {
      this.state.completedModels.push(modelName);
    }
    this.save();
    return cp;
  }

  markModelFailed(modelName, error) {
    const cp = this.getModelCheckpoint(modelName);
    cp.status = "failed";
    cp.errors.push({
      message: error.message || String(error),
      timestamp: new Date().toISOString(),
    });
    cp.updatedAt = new Date().toISOString();
    this.save();
    return cp;
  }

  isModelCompleted(modelName) {
    const cp = this.getModelCheckpoint(modelName);
    return cp.status === "completed";
  }

  reset() {
    this.state = {
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      models: {},
      completedModels: [],
    };
    this.save();
    logger.info("Migration checkpoint state reset successfully.");
  }
}

export const checkpoint = new CheckpointManager();
export default checkpoint;
