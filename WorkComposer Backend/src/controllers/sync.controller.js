import SyncStatus from "../models/syncStatus.model.js";

export const getSyncStatus = async (req, res) => {
  try {
    let sync = await SyncStatus.findOne({
      user: req.user._id,
    });

    if (!sync) {
      sync = await SyncStatus.create({
        user: req.user._id,
      });
    }

    res.json(sync);
  } catch (err) {
    console.error("GET SYNC STATUS ERROR:", err);
    res.status(500).json({
      message: "Failed to get sync status",
      error: "Failed to get sync status",
    });
  }
};
