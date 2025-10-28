import electionService from '../services/electionService.js';
import subscriptionCheckService from '../services/subscriptionCheckService.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse } from '../utils/helpers.js';
import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';
import { getFileUrl } from '../middleware/uploadMiddleware.js';

class ElectionController {
  /**
   * Create draft election
   */
  createDraft = asyncHandler(async (req, res) => {
    const { userId, creatorType } = req.user;
    const draftData = req.body;

    const draft = await electionService.createDraft(userId, creatorType, draftData);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, draft, 'Draft created successfully')
    );
  });

  /**
   * Get draft by ID
   */
  getDraft = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    const draft = await electionService.getDraft(id, userId);

    if (!draft) {
      throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, draft, 'Draft retrieved successfully')
    );
  });

  /**
   * Update draft
   */
  updateDraft = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const updateData = req.body;

    // Handle file uploads if present
    if (req.files) {
      if (req.files.topic_image) {
        updateData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
      }
      if (req.files.topic_video) {
        updateData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
      }
      if (req.files.logo) {
        updateData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
      }
    }

    const draft = await electionService.updateDraft(id, userId, updateData);

    if (!draft) {
      throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, draft, 'Draft updated successfully')
    );
  });

  /**
   * Publish election from draft
   */
  publishElection = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const electionData = req.body;

    const election = await electionService.publishElectionFromDraft(id, userId, electionData);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, election, 'Election published successfully')
    );
  });

  /**
   * Create election directly (without draft)
   */
  createElection = asyncHandler(async (req, res) => {
    const { userId, creatorType } = req.user;
    const electionData = req.body;

    // Handle file uploads if present
    if (req.files) {
      if (req.files.topic_image) {
        electionData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
      }
      if (req.files.topic_video) {
        electionData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
      }
      if (req.files.logo) {
        electionData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
      }
    }

    const election = await electionService.createElection(userId, creatorType, electionData);

    res.status(HTTP_STATUS.CREATED).json(
      formatResponse(true, election, 'Election created successfully')
    );
  });

  /**
   * Get election by ID
   */
  getElection = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const election = await electionService.getElectionById(id);

    if (!election) {
      throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, election, 'Election retrieved successfully')
    );
  });

  /**
   * Get election by slug
   */
  getElectionBySlug = asyncHandler(async (req, res) => {
    const { slug } = req.params;

    const election = await electionService.getElectionBySlug(slug);

    if (!election) {
      throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, election, 'Election retrieved successfully')
    );
  });

  /**
   * Get user's elections
   */
  getMyElections = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { status, page, limit } = req.query;

    const result = await electionService.getUserElections(userId, {
      status,
      page,
      limit
    });

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result, 'Elections retrieved successfully')
    );
  });

  /**
   * Update election
   */
  updateElection = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;
    const updateData = req.body;

    // Handle file uploads if present
    if (req.files) {
      if (req.files.topic_image) {
        updateData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
      }
      if (req.files.topic_video) {
        updateData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
      }
      if (req.files.logo) {
        updateData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
      }
    }

    const election = await electionService.updateElection(id, userId, updateData);

    if (!election) {
      throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, election, 'Election updated successfully')
    );
  });

  /**
   * Delete election
   */
  deleteElection = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    const election = await electionService.deleteElection(id, userId);

    if (!election) {
      throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, null, 'Election deleted successfully')
    );
  });

  /**
   * Get user's drafts
   */
  getMyDrafts = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const drafts = await electionService.getUserDrafts(userId);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, drafts, 'Drafts retrieved successfully')
    );
  });

  /**
   * Delete draft
   */
  deleteDraft = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    const draft = await electionService.deleteDraft(id, userId);

    if (!draft) {
      throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
    }

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, null, 'Draft deleted successfully')
    );
  });

  /**
   * Check eligibility to create election
   */
  checkEligibility = asyncHandler(async (req, res) => {
    const { userId, isSubscribed } = req.user;

    const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, eligibility, 'Eligibility checked successfully')
    );
  });

  /**
   * Get public elections
   */
  getPublicElections = asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;

    const result = await electionService.getPublicElections({
      page,
      limit,
      status
    });

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result, 'Public elections retrieved successfully')
    );
  });
}

export default new ElectionController();