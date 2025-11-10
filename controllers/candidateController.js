const Candidate = require('../models/Candidate');
const axios = require('axios');

// Fetch candidates from external API and save to DB
const fetchAndSaveCandidates = async (req, res) => {
  try {
    console.log('Fetching candidates from external API...');
    const response = await axios.get('https://sosapient-backend.onrender.com/api/career');
    console.log('API Response:', response.data);

    const candidatesData = response.data.data; // The API returns { success: true, data: [...] }
    console.log('Candidates data:', candidatesData);

    // Save each candidate to DB if not already exists
    const savedCandidates = [];
    for (const candidateData of candidatesData) {
      try {
        const existingCandidate = await Candidate.findOne({ email: candidateData.email });
        if (!existingCandidate) {
          const candidate = new Candidate({
            name: candidateData.name,
            email: candidateData.email,
            phone: candidateData.phone,
            position: candidateData.position,
            currentCompany: candidateData.currentCompany,
            experience: candidateData.experience,
            expectedSalary: candidateData.expectedSalary,
            noticePeriod: candidateData.noticePeriod,
            coverLetter: candidateData.coverLetter,
            resume: candidateData.resume,
            status: candidateData.status
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
      candidates: savedCandidates
    });
  } catch (error) {
    console.error('Error fetching and saving candidates:', error);
    res.status(500).json({
      message: 'Error fetching and saving candidates',
      error: error.message,
      stack: error.stack
    });
  }
};

// Get all candidates from DB
const getCandidates = async (req, res) => {
  try {
    const candidates = await Candidate.find().sort({ createdAt: -1 });
    res.status(200).json(candidates);
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
  getCandidates,
  updateCandidateStatus
};