import { userRepository } from "../db/repositories/index.js";
import { normalizeId } from "../security/effectiveAuthContext.js";

export const getTrackingReportRecipients = async (user) => {
  const orgId = normalizeId(user.organization?._id || user.organization || user.organizationId);
  const userId = normalizeId(user._id || user.id);

  switch (user.role) {
    case "owner":
    case "admin":
      return await userRepository.find({
        organization: orgId,
        isVerified: true,
      });

    case "manager":
      return await userRepository.find({
        organization: orgId,
        manager: userId,
        isVerified: true,
      });

    default:
      return [user];
  }
};
