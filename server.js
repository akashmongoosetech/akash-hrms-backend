require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// connect DB
connectDB(process.env.MONGO_URI || 'mongodb://localhost:27017/hrms');

// routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/events', require('./routes/events'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/projects', require('./routes/projects'));

// example protected route
const authenticate = require('./middleware/auth');
const authorizeRoles = require('./middleware/authorize');

app.get('/api/protected/employee', authenticate, (req, res) => {
  return res.json({ message: 'Hello Employee', user: req.user.email });
});

app.get('/api/protected/admin', authenticate, authorizeRoles('Admin'), (req, res) => {
  return res.json({ message: 'Hello Admin', user: req.user.email });
});

const PORT = process.env.PORT || 5004;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
