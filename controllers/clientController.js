const Client = require('../models/Client');

const getClients = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalClients = await Client.countDocuments();
    const clients = await Client.find().sort({ createdAt: -1 }).skip(skip).limit(limit);

    res.json({
      clients,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalClients / limit),
        totalItems: totalClients,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getClientById = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createClient = async (req, res) => {
  try {
    const { profile, name, email, about, country, state, city, status } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    const existing = await Client.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already exists' });

    const clientData = { profile, name, email, about, country, state, city, status };

    if (req.files && req.files['profile']) {
      clientData.profile = req.files['profile'][0].path;
    }

    const client = new Client(clientData);
    await client.save();

    res.status(201).json({ message: 'Client created successfully', client });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateClient = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Handle file upload for profile
    if (req.files && req.files['profile']) {
      updates.profile = req.files['profile'][0].path;
    }

    const client = await Client.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!client) return res.status(404).json({ message: 'Client not found' });

    res.json({ message: 'Client updated successfully', client });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const client = await Client.findByIdAndDelete(id);
    if (!client) return res.status(404).json({ message: 'Client not found' });

    res.json({ message: 'Client deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getClients, getClientById, createClient, updateClient, deleteClient };