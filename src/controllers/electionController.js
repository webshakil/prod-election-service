import electionService from '../services/electionService.js';
import subscriptionCheckService from '../services/subscriptionCheckService.js';
import { asyncHandler, AppError } from '../utils/errorHandler.js';
import { formatResponse } from '../utils/helpers.js';
import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';
import { emitElectionCreated } from '../../socket/notificationSocket.js';
// ✅ ONLY CHANGE #1: Added this import
//import { emitElectionCreated } from '../socket/notificationSocket.js';

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

    // Cloudinary URLs are in req.files[].path
    if (req.files) {
      if (req.files.topic_image && req.files.topic_image[0]) {
        console.log('✅ Draft: Setting topic_image_url to:', req.files.topic_image[0].path);
        updateData.topic_image_url = req.files.topic_image[0].path;
      }
      if (req.files.topic_video && req.files.topic_video[0]) {
        console.log('✅ Draft: Setting topic_video_url to:', req.files.topic_video[0].path);
        updateData.topic_video_url = req.files.topic_video[0].path;
      }
      if (req.files.logo && req.files.logo[0]) {
        console.log('✅ Draft: Setting logo_url to:', req.files.logo[0].path);
        updateData.logo_url = req.files.logo[0].path;
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
    
    console.log(' req.files:', req.files);
    console.log(' req.body.electionData:', req.body.electionData);
    
    let electionData;
    if (req.body.electionData) {
      electionData = JSON.parse(req.body.electionData);
    } else {
      electionData = req.body;
    }

    console.log(' Parsed electionData before files:', electionData.election?.topic_image_url);

    // Cloudinary URLs are in req.files[].path
    if (req.files) {
      if (req.files.topic_image && req.files.topic_image[0]) {
        console.log(' Setting topic_image_url to:', req.files.topic_image[0].path);
        if (electionData.election) {
          electionData.election.topic_image_url = req.files.topic_image[0].path;
        } else {
          electionData.topic_image_url = req.files.topic_image[0].path;
        }
      }
      if (req.files.topic_video && req.files.topic_video[0]) {
        console.log('✅ Setting topic_video_url to:', req.files.topic_video[0].path);
        if (electionData.election) {
          electionData.election.topic_video_url = req.files.topic_video[0].path;
        } else {
          electionData.topic_video_url = req.files.topic_video[0].path;
        }
      }
      if (req.files.logo && req.files.logo[0]) {
        console.log('✅ Setting logo_url to:', req.files.logo[0].path);
        if (electionData.election) {
          electionData.election.logo_url = req.files.logo[0].path;
        } else {
          electionData.logo_url = req.files.logo[0].path;
        }
      }
    }

    console.log('📋Parsed electionData after files:', electionData.election?.topic_image_url);

    const election = await electionService.publishElectionFromDraft(id, userId, electionData);

    // ✅ ONLY CHANGE #2: Added this WebSocket notification block (7 lines)
    setImmediate(() => {
      try {
        emitElectionCreated({ id: election.id, title: election.title, creator_id: userId });
        console.log('📢 Election created notification sent');
      } catch (socketError) {
        console.error('⚠️ Socket emission error:', socketError);
      }
    });
    // ✅ END OF CHANGE #2

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

    // Cloudinary URLs are in req.files[].path
    if (req.files) {
      if (req.files.topic_image && req.files.topic_image[0]) {
        electionData.topic_image_url = req.files.topic_image[0].path;
      }
      if (req.files.topic_video && req.files.topic_video[0]) {
        electionData.topic_video_url = req.files.topic_video[0].path;
      }
      if (req.files.logo && req.files.logo[0]) {
        electionData.logo_url = req.files.logo[0].path;
      }
    }

    const election = await electionService.createElection(userId, creatorType, electionData);

    // ✅ ONLY CHANGE #3: Added this WebSocket notification block (7 lines)
    setImmediate(() => {
      try {
        emitElectionCreated({ id: election.id, title: election.title, creator_id: userId });
        console.log('📢 Election created notification sent');
      } catch (socketError) {
        console.error('⚠️ Socket emission error:', socketError);
      }
    });
    // ✅ END OF CHANGE #3

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
   * ✅ FIXED: Now passes includeFullData: true to get regional_pricing, lottery_config, questions
   */
  getMyElections = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { status, page, limit } = req.query;

    const result = await electionService.getUserElections(userId, {
      status,
      page,
      limit,
      includeFullData: true  // ✅ FIXED: Added this line
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

    // Cloudinary URLs are in req.files[].path
    if (req.files) {
      if (req.files.topic_image && req.files.topic_image[0]) {
        updateData.topic_image_url = req.files.topic_image[0].path;
      }
      if (req.files.topic_video && req.files.topic_video[0]) {
        updateData.topic_video_url = req.files.topic_video[0].path;
      }
      if (req.files.logo && req.files.logo[0]) {
        updateData.logo_url = req.files.logo[0].path;
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
   * ✅ FIXED: Now passes includeFullData: true to get regional_pricing, lottery_config
   */
  getPublicElections = asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;

    const result = await electionService.getPublicElections({
      page,
      limit,
      status,
      includeFullData: true  // ✅ FIXED: Added this line
    });

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result, 'Public elections retrieved successfully')
    );
  });

  /**
   * ✅ FIXED: Get ALL elections (for any authenticated user)
   * Now passes includeFullData: true to get regional_pricing, lottery_config, questions
   */
  getAllElections = asyncHandler(async (req, res) => {
    const { page, limit, status } = req.query;

    const result = await electionService.getAllElections({
      page,
      limit,
      status,
      includeFullData: true  // ✅ FIXED: Added this line
    });

    console.log('✅ [Controller] getAllElections response:', {
      count: result.elections?.length || 0,
      firstElection: result.elections?.[0] ? {
        id: result.elections[0].id,
        title: result.elections[0].title,
        hasRegionalPricing: !!result.elections[0].regional_pricing,
        regionalPricingCount: Array.isArray(result.elections[0].regional_pricing) ? result.elections[0].regional_pricing.length : 0,
        hasLottery: !!result.elections[0].lottery_config,
        hasQuestions: !!result.elections[0].questions,
        questionsCount: Array.isArray(result.elections[0].questions) ? result.elections[0].questions.length : 0
      } : null
    });

    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, result, 'All elections retrieved successfully')
    );
  });

  /**
   * Get available files (legacy endpoint - not needed with Cloudinary)
   */
  getAvailableFiles = asyncHandler(async (req, res) => {
    res.status(HTTP_STATUS.OK).json(
      formatResponse(true, { images: [], videos: [], logos: [] }, 'Using Cloudinary - no local files')
    );
  });
}

export default new ElectionController();
//last workable perfect code. jus to implement socket.io above code
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log('✅ Draft: Setting topic_image_url to:', req.files.topic_image[0].path);
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Draft: Setting topic_video_url to:', req.files.topic_video[0].path);
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Draft: Setting logo_url to:', req.files.logo[0].path);
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     console.log(' req.files:', req.files);
//     console.log(' req.body.electionData:', req.body.electionData);
    
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     console.log(' Parsed electionData before files:', electionData.election?.topic_image_url);

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log(' Setting topic_image_url to:', req.files.topic_image[0].path);
//         if (electionData.election) {
//           electionData.election.topic_image_url = req.files.topic_image[0].path;
//         } else {
//           electionData.topic_image_url = req.files.topic_image[0].path;
//         }
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Setting topic_video_url to:', req.files.topic_video[0].path);
//         if (electionData.election) {
//           electionData.election.topic_video_url = req.files.topic_video[0].path;
//         } else {
//           electionData.topic_video_url = req.files.topic_video[0].path;
//         }
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Setting logo_url to:', req.files.logo[0].path);
//         if (electionData.election) {
//           electionData.election.logo_url = req.files.logo[0].path;
//         } else {
//           electionData.logo_url = req.files.logo[0].path;
//         }
//       }
//     }

//     console.log('📋Parsed electionData after files:', electionData.election?.topic_image_url);

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    * ✅ FIXED: Now passes includeFullData: true to get regional_pricing, lottery_config, questions
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit,
//       includeFullData: true  // ✅ FIXED: Added this line
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    * ✅ FIXED: Now passes includeFullData: true to get regional_pricing, lottery_config
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status,
//       includeFullData: true  // ✅ FIXED: Added this line
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });

//   /**
//    * ✅ FIXED: Get ALL elections (for any authenticated user)
//    * Now passes includeFullData: true to get regional_pricing, lottery_config, questions
//    */
//   getAllElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getAllElections({
//       page,
//       limit,
//       status,
//       includeFullData: true  // ✅ FIXED: Added this line
//     });

//     console.log('✅ [Controller] getAllElections response:', {
//       count: result.elections?.length || 0,
//       firstElection: result.elections?.[0] ? {
//         id: result.elections[0].id,
//         title: result.elections[0].title,
//         hasRegionalPricing: !!result.elections[0].regional_pricing,
//         regionalPricingCount: Array.isArray(result.elections[0].regional_pricing) ? result.elections[0].regional_pricing.length : 0,
//         hasLottery: !!result.elections[0].lottery_config,
//         hasQuestions: !!result.elections[0].questions,
//         questionsCount: Array.isArray(result.elections[0].questions) ? result.elections[0].questions.length : 0
//       } : null
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'All elections retrieved successfully')
//     );
//   });

//   /**
//    * Get available files (legacy endpoint - not needed with Cloudinary)
//    */
//   getAvailableFiles = asyncHandler(async (req, res) => {
//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, { images: [], videos: [], logos: [] }, 'Using Cloudinary - no local files')
//     );
//   });
// }

// export default new ElectionController();
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log('✅ Draft: Setting topic_image_url to:', req.files.topic_image[0].path);
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Draft: Setting topic_video_url to:', req.files.topic_video[0].path);
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Draft: Setting logo_url to:', req.files.logo[0].path);
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     console.log('📸 req.files:', req.files);
//     console.log('📝 req.body.electionData:', req.body.electionData);
    
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     console.log('📋 Parsed electionData before files:', electionData.election?.topic_image_url);

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log('✅ Setting topic_image_url to:', req.files.topic_image[0].path);
//         if (electionData.election) {
//           electionData.election.topic_image_url = req.files.topic_image[0].path;
//         } else {
//           electionData.topic_image_url = req.files.topic_image[0].path;
//         }
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Setting topic_video_url to:', req.files.topic_video[0].path);
//         if (electionData.election) {
//           electionData.election.topic_video_url = req.files.topic_video[0].path;
//         } else {
//           electionData.topic_video_url = req.files.topic_video[0].path;
//         }
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Setting logo_url to:', req.files.logo[0].path);
//         if (electionData.election) {
//           electionData.election.logo_url = req.files.logo[0].path;
//         } else {
//           electionData.logo_url = req.files.logo[0].path;
//         }
//       }
//     }

//     console.log('📋 Parsed electionData after files:', electionData.election?.topic_image_url);

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    * ✅ UPDATED: Now includes regional_pricing, lottery_config, questions
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     // ✅ UPDATED: Pass includeFullData flag to get complete election data
//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit,
//       includeFullData: true  // ✅ NEW: Get regional_pricing, lottery_config, questions
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    * ✅ UPDATED: Now includes regional_pricing, lottery_config
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     // ✅ UPDATED: Pass includeFullData flag
//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status,
//       includeFullData: true  // ✅ NEW: Get regional_pricing, lottery_config
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });

//   /**
//    * ✅ UPDATED: Get ALL elections (for any authenticated user)
//    * Now includes regional_pricing, lottery_config, questions
//    */
//   getAllElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     // ✅ UPDATED: Pass includeFullData flag to get complete election data
//     const result = await electionService.getAllElections({
//       page,
//       limit,
//       status,
//       includeFullData: true  // ✅ NEW: Get regional_pricing, lottery_config, questions
//     });

//     console.log('✅ [Controller] getAllElections returning:', {
//       count: result.elections?.length || 0,
//       firstHasRegionalPricing: result.elections?.[0] ? !!result.elections[0].regional_pricing : false,
//       firstHasLottery: result.elections?.[0] ? !!result.elections[0].lottery_config : false,
//       firstHasQuestions: result.elections?.[0] ? !!result.elections[0].questions : false
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'All elections retrieved successfully')
//     );
//   });

//   /**
//    * Get available files (legacy endpoint - not needed with Cloudinary)
//    */
//   getAvailableFiles = asyncHandler(async (req, res) => {
//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, { images: [], videos: [], logos: [] }, 'Using Cloudinary - no local files')
//     );
//   });
// }

// export default new ElectionController();
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log('✅ Draft: Setting topic_image_url to:', req.files.topic_image[0].path);
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Draft: Setting topic_video_url to:', req.files.topic_video[0].path);
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Draft: Setting logo_url to:', req.files.logo[0].path);
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     console.log('📸 req.files:', req.files);
//     console.log('📝 req.body.electionData:', req.body.electionData);
    
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     console.log('📋 Parsed electionData before files:', electionData.election?.topic_image_url);

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log('✅ Setting topic_image_url to:', req.files.topic_image[0].path);
//         if (electionData.election) {
//           electionData.election.topic_image_url = req.files.topic_image[0].path;
//         } else {
//           electionData.topic_image_url = req.files.topic_image[0].path;
//         }
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Setting topic_video_url to:', req.files.topic_video[0].path);
//         if (electionData.election) {
//           electionData.election.topic_video_url = req.files.topic_video[0].path;
//         } else {
//           electionData.topic_video_url = req.files.topic_video[0].path;
//         }
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Setting logo_url to:', req.files.logo[0].path);
//         if (electionData.election) {
//           electionData.election.logo_url = req.files.logo[0].path;
//         } else {
//           electionData.logo_url = req.files.logo[0].path;
//         }
//       }
//     }

//     console.log('📋 Parsed electionData after files:', electionData.election?.topic_image_url);

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });

//   /**
//    * ✅ NEW: Get ALL elections (for any authenticated user)
//    */
//   getAllElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getAllElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'All elections retrieved successfully')
//     );
//   });

//   /**
//    * Get available files (legacy endpoint - not needed with Cloudinary)
//    */
//   getAvailableFiles = asyncHandler(async (req, res) => {
//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, { images: [], videos: [], logos: [] }, 'Using Cloudinary - no local files')
//     );
//   });
// }

// export default new ElectionController();







//last workbale code
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log('✅ Draft: Setting topic_image_url to:', req.files.topic_image[0].path);
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Draft: Setting topic_video_url to:', req.files.topic_video[0].path);
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Draft: Setting logo_url to:', req.files.logo[0].path);
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     console.log('📸 req.files:', req.files);
//     console.log('📝 req.body.electionData:', req.body.electionData);
    
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     console.log('📋 Parsed electionData before files:', electionData.election?.topic_image_url);

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         console.log('✅ Setting topic_image_url to:', req.files.topic_image[0].path);
//         if (electionData.election) {
//           electionData.election.topic_image_url = req.files.topic_image[0].path;
//         } else {
//           electionData.topic_image_url = req.files.topic_image[0].path;
//         }
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         console.log('✅ Setting topic_video_url to:', req.files.topic_video[0].path);
//         if (electionData.election) {
//           electionData.election.topic_video_url = req.files.topic_video[0].path;
//         } else {
//           electionData.topic_video_url = req.files.topic_video[0].path;
//         }
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         console.log('✅ Setting logo_url to:', req.files.logo[0].path);
//         if (electionData.election) {
//           electionData.election.logo_url = req.files.logo[0].path;
//         } else {
//           electionData.logo_url = req.files.logo[0].path;
//         }
//       }
//     }

//     console.log('📋 Parsed electionData after files:', electionData.election?.topic_image_url);

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });

//   /**
//    * Get available files (legacy endpoint - not needed with Cloudinary)
//    */
//   getAvailableFiles = asyncHandler(async (req, res) => {
//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, { images: [], videos: [], logos: [] }, 'Using Cloudinary - no local files')
//     );
//   });
// }

// export default new ElectionController();


























//last workable code
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });

//   /**
//    * Get available files (legacy endpoint - not needed with Cloudinary)
//    */
//   getAvailableFiles = asyncHandler(async (req, res) => {
//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, { images: [], videos: [], logos: [] }, 'Using Cloudinary - no local files')
//     );
//   });
// }

// export default new ElectionController();
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Cloudinary URLs are in req.files[].path
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = req.files.topic_image[0].path;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = req.files.topic_video[0].path;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = req.files.logo[0].path;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });
// }

// export default new ElectionController();
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';
// import fs from 'fs';
// import path from 'path';
// import { fileURLToPath } from 'url';

// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });

//   /**
//    * Get all available files from uploads folder
//    */
//   getAvailableFiles = asyncHandler(async (req, res) => {
//     try {
//       const uploadsDir = path.join(__dirname, '../../uploads');
//       const result = {
//         images: [],
//         videos: [],
//         logos: []
//       };

//       const imagesPath = path.join(uploadsDir, 'images');
//       if (fs.existsSync(imagesPath)) {
//         const imageFiles = fs.readdirSync(imagesPath);
//         result.images = imageFiles.map(filename => ({
//           filename,
//           path: `/uploads/images/${filename}`,
//           url: `${process.env.BACKEND_URL || 'http://localhost:3005'}/uploads/images/${filename}`
//         }));
//       }

//       const videosPath = path.join(uploadsDir, 'videos');
//       if (fs.existsSync(videosPath)) {
//         const videoFiles = fs.readdirSync(videosPath);
//         result.videos = videoFiles.map(filename => ({
//           filename,
//           path: `/uploads/videos/${filename}`,
//           url: `${process.env.BACKEND_URL || 'http://localhost:3005'}/uploads/videos/${filename}`
//         }));
//       }

//       const logosPath = path.join(uploadsDir, 'logos');
//       if (fs.existsSync(logosPath)) {
//         const logoFiles = fs.readdirSync(logosPath);
//         result.logos = logoFiles.map(filename => ({
//           filename,
//           path: `/uploads/logos/${filename}`,
//           url: `${process.env.BACKEND_URL || 'http://localhost:3005'}/uploads/logos/${filename}`
//         }));
//       }

//       res.status(HTTP_STATUS.OK).json(
//         formatResponse(true, result, 'Files retrieved successfully')
//       );
//     } catch (error) {
//       console.error('Error scanning uploads folder:', error);
//       throw new AppError('Failed to retrieve files', HTTP_STATUS.INTERNAL_SERVER_ERROR);
//     }
//   });
// }

// export default new ElectionController();
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // ⭐ FIXED: Save relative paths instead of full URLs
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
    
//     // Parse election data (it comes as JSON string in FormData)
//     let electionData;
//     if (req.body.electionData) {
//       electionData = JSON.parse(req.body.electionData);
//     } else {
//       electionData = req.body;
//     }

//     // ⭐ FIXED: Save relative paths instead of full URLs
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // ⭐ FIXED: Save relative paths instead of full URLs
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         electionData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         electionData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         electionData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // ⭐ FIXED: Save relative paths instead of full URLs
//     if (req.files) {
//       if (req.files.topic_image && req.files.topic_image[0]) {
//         updateData.topic_image_url = `/uploads/images/${req.files.topic_image[0].filename}`;
//       }
//       if (req.files.topic_video && req.files.topic_video[0]) {
//         updateData.topic_video_url = `/uploads/videos/${req.files.topic_video[0].filename}`;
//       }
//       if (req.files.logo && req.files.logo[0]) {
//         updateData.logo_url = `/uploads/logos/${req.files.logo[0].filename}`;
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });

  
// }

// export default new ElectionController();
//last workable code
// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';
// import { getFileUrl } from '../middleware/uploadMiddleware.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Handle file uploads if present
//     if (req.files) {
//       if (req.files.topic_image) {
//         updateData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
//       }
//       if (req.files.topic_video) {
//         updateData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
//       }
//       if (req.files.logo) {
//         updateData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//  /**
//  * Publish election from draft
//  */
// publishElection = asyncHandler(async (req, res) => {
//   const { id } = req.params;
//   const { userId } = req.user;
  
//   // Parse election data (it comes as JSON string in FormData)
//   let electionData;
//   if (req.body.electionData) {
//     electionData = JSON.parse(req.body.electionData);
//   } else {
//     electionData = req.body;
//   }

//   // Handle file uploads if present
//   if (req.files) {
//     if (req.files.topic_image) {
//       electionData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
//     }
//     if (req.files.topic_video) {
//       electionData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
//     }
//     if (req.files.logo) {
//       electionData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
//     }
//   }

//   const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//   res.status(HTTP_STATUS.CREATED).json(
//     formatResponse(true, election, 'Election published successfully')
//   );
// });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Handle file uploads if present
//     if (req.files) {
//       if (req.files.topic_image) {
//         electionData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
//       }
//       if (req.files.topic_video) {
//         electionData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
//       }
//       if (req.files.logo) {
//         electionData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Handle file uploads if present
//     if (req.files) {
//       if (req.files.topic_image) {
//         updateData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
//       }
//       if (req.files.topic_video) {
//         updateData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
//       }
//       if (req.files.logo) {
//         updateData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });
// }

// export default new ElectionController();















// import electionService from '../services/electionService.js';
// import subscriptionCheckService from '../services/subscriptionCheckService.js';
// import { asyncHandler, AppError } from '../utils/errorHandler.js';
// import { formatResponse } from '../utils/helpers.js';
// import { HTTP_STATUS, ERROR_MESSAGES } from '../config/constants.js';
// import { getFileUrl } from '../middleware/uploadMiddleware.js';

// class ElectionController {
//   /**
//    * Create draft election
//    */
//   createDraft = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const draftData = req.body;

//     const draft = await electionService.createDraft(userId, creatorType, draftData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, draft, 'Draft created successfully')
//     );
//   });

//   /**
//    * Get draft by ID
//    */
//   getDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.getDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft retrieved successfully')
//     );
//   });

//   /**
//    * Update draft
//    */
//   updateDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Handle file uploads if present
//     if (req.files) {
//       if (req.files.topic_image) {
//         updateData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
//       }
//       if (req.files.topic_video) {
//         updateData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
//       }
//       if (req.files.logo) {
//         updateData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
//       }
//     }

//     const draft = await electionService.updateDraft(id, userId, updateData);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, draft, 'Draft updated successfully')
//     );
//   });

//   /**
//    * Publish election from draft
//    */
//   publishElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const electionData = req.body;

//     const election = await electionService.publishElectionFromDraft(id, userId, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election published successfully')
//     );
//   });

//   /**
//    * Create election directly (without draft)
//    */
//   createElection = asyncHandler(async (req, res) => {
//     const { userId, creatorType } = req.user;
//     const electionData = req.body;

//     // Handle file uploads if present
//     if (req.files) {
//       if (req.files.topic_image) {
//         electionData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
//       }
//       if (req.files.topic_video) {
//         electionData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
//       }
//       if (req.files.logo) {
//         electionData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
//       }
//     }

//     const election = await electionService.createElection(userId, creatorType, electionData);

//     res.status(HTTP_STATUS.CREATED).json(
//       formatResponse(true, election, 'Election created successfully')
//     );
//   });

//   /**
//    * Get election by ID
//    */
//   getElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;

//     const election = await electionService.getElectionById(id);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get election by slug
//    */
//   getElectionBySlug = asyncHandler(async (req, res) => {
//     const { slug } = req.params;

//     const election = await electionService.getElectionBySlug(slug);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election retrieved successfully')
//     );
//   });

//   /**
//    * Get user's elections
//    */
//   getMyElections = asyncHandler(async (req, res) => {
//     const { userId } = req.user;
//     const { status, page, limit } = req.query;

//     const result = await electionService.getUserElections(userId, {
//       status,
//       page,
//       limit
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Elections retrieved successfully')
//     );
//   });

//   /**
//    * Update election
//    */
//   updateElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;
//     const updateData = req.body;

//     // Handle file uploads if present
//     if (req.files) {
//       if (req.files.topic_image) {
//         updateData.topic_image_url = getFileUrl(req.files.topic_image[0].filename, 'images');
//       }
//       if (req.files.topic_video) {
//         updateData.topic_video_url = getFileUrl(req.files.topic_video[0].filename, 'videos');
//       }
//       if (req.files.logo) {
//         updateData.logo_url = getFileUrl(req.files.logo[0].filename, 'logos');
//       }
//     }

//     const election = await electionService.updateElection(id, userId, updateData);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, election, 'Election updated successfully')
//     );
//   });

//   /**
//    * Delete election
//    */
//   deleteElection = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const election = await electionService.deleteElection(id, userId);

//     if (!election) {
//       throw new AppError(ERROR_MESSAGES.ELECTION_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Election deleted successfully')
//     );
//   });

//   /**
//    * Get user's drafts
//    */
//   getMyDrafts = asyncHandler(async (req, res) => {
//     const { userId } = req.user;

//     const drafts = await electionService.getUserDrafts(userId);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, drafts, 'Drafts retrieved successfully')
//     );
//   });

//   /**
//    * Delete draft
//    */
//   deleteDraft = asyncHandler(async (req, res) => {
//     const { id } = req.params;
//     const { userId } = req.user;

//     const draft = await electionService.deleteDraft(id, userId);

//     if (!draft) {
//       throw new AppError(ERROR_MESSAGES.DRAFT_NOT_FOUND, HTTP_STATUS.NOT_FOUND);
//     }

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, null, 'Draft deleted successfully')
//     );
//   });

//   /**
//    * Check eligibility to create election
//    */
//   checkEligibility = asyncHandler(async (req, res) => {
//     const { userId, isSubscribed } = req.user;

//     const eligibility = await subscriptionCheckService.checkEligibility(userId, isSubscribed);

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, eligibility, 'Eligibility checked successfully')
//     );
//   });

//   /**
//    * Get public elections
//    */
//   getPublicElections = asyncHandler(async (req, res) => {
//     const { page, limit, status } = req.query;

//     const result = await electionService.getPublicElections({
//       page,
//       limit,
//       status
//     });

//     res.status(HTTP_STATUS.OK).json(
//       formatResponse(true, result, 'Public elections retrieved successfully')
//     );
//   });
// }

// export default new ElectionController();