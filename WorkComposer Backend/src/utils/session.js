import { sessionRepository } from "../db/repositories/session.repository.js";

export const checkSessionOverlap = async (userId, startTime, endTime) => {
  return await sessionRepository.checkOverlap(userId, startTime, endTime);
};

