const Candidate = require('../models/Candidate');
const { syncCareerData: performCareerSync } = require('../services/careerSyncService');
const axios = require('axios');

// Fetch candidates from external API and save to Candidates collection
const fetchAndSaveCandidates = async (req, res) => {
  try {
    console.log('Fetching candidates from external API...');
    const response = await axios.get(process.env.CAREER_SOURCE_API_URL, {
      headers: {
        ...(process.env.CAREER_SYNC_API_KEY ? { 'X-Career-Sync-Api-Key': process.env.CAREER_SYNC_API_KEY } : {}),
      },
    });
    console.log('API Response:', response.data);

    const candidatesData = response.data.data; // The API returns { success: true, data: [...] }
    console.log('Candidates data:', candidatesData);

    // Save each candidate to Candidates collection if not already exists
    const savedCandidates = [];
    for (const candidateData of candidatesData) {
      try {
        const externalId = candidateData._id || candidateData.id;
        if (!externalId) {
          console.error('Skipping record without source ID:', candidateData);
          continue;
        }

        const existingCandidate = await Candidate.findOne({ externalCareerId: String(externalId) });
        if (!existingCandidate) {
          const candidate = new Candidate({
            externalCareerId: String(externalId),
            name: candidateData.name,
            email: candidateData.email,
            phone: candidateData.phone,
            position: candidateData.position,
            currentCompany: candidateData.currentCompany || '',
            experience: candidateData.experience || '',
            expectedSalary: candidateData.expectedSalary || '',
            noticePeriod: candidateData.noticePeriod || '',
            coverLetter: candidateData.coverLetter || '',
            resume: candidateData.resume || { contentType: '', filename: '' },
            status: candidateData.status || 'pending',
          });
          await candidate.save();
          savedCandidates.push(candidate);
          console.log('Saved candidate:', candidateData.email);
        } else {
          console.log('Candidate already exists:', candidateData.email);
        }
      } catch (saveError) {
        console.error('Error saving candidate:', candidateData.email, saveError);
      }
    }

    res.status(200).json({
      message: 'Candidates fetched and saved successfully',
      savedCount: savedCandidates.length,
      candidates: savedCandidates,
    });
  } catch (error) {
    console.error('Error fetching and saving candidates:', error);

    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
      return res.status(401).json({
        message: 'Career source API authentication failed',
        upstreamStatus: error.response.status,
      });
    }

    res.status(500).json({
      message: 'Error fetching and saving candidates',
      error: error.message,
    });
  }
};

// Smart sync career data from main API - one-way, non-destructive sync into Candidates
const syncCareerData = async (req, res) => {
  try {
    const summary = await performCareerSync(req.user);

    res.status(200).json({
      success: summary.status === 'Success',
      message: summary.status === 'Success' ? 'Career data synchronized successfully' : 'Career data synchronization failed',
      summary: {
        totalFetched: summary.totalFetched,
        new: summary.new,
        updated: summary.updated,
        unchanged: summary.unchanged,
        deleted: summary.deleted, // Always 0
      },
      newCareers: summary.newCareers || [],
      updatedCareers: summary.updatedCareers || [],
    });
  } catch (error) {
    console.error('Error syncing career data:', error);

    // Structured SyncError from the service layer
    if (error && error.name === 'SyncError') {
      return res.status(error.statusCode || 502).json({
        success: false,
        message: 'Career data synchronization failed',
        error: error.message,
        stage: error.stage || 'unknown',
        endpoint: error.endpoint || null,
      });
    }

    // Generic server error - never leak stack traces
    return res.status(500).json({
      success: false,
      message: 'Career data synchronization failed',
      error: 'Internal server error',
    });
  }
};

// Get all candidates from DB
const getCandidates = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const candidates = await Candidate.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await Candidate.countDocuments({ isDeleted: { $ne: true } });

    res.status(200).json({ candidates, total });
  } catch (error) {
    console.error('Error fetching candidates:', error);
    res.status(500).json({ message: 'Error fetching candidates', error: error.message });
  }
};

// Update candidate status
const updateCandidateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const candidate = await Candidate.findByIdAndUpdate(id, { status }, { new: true });
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    res.status(200).json(candidate);
  } catch (error) {
    console.error('Error updating candidate status:', error);
    res.status(500).json({ message: 'Error updating candidate status', error: error.message });
  }
};

module.exports = {
  fetchAndSaveCandidates,
  syncCareerData,
  getCandidates,
  updateCandidateStatus,
};
