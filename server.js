require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const connectDB = require('./config/db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173", // Frontend URL
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve uploads
app.use('/api/uploads', express.static(path.join(__dirname, 'uploads')));

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
app.use('/api/todos', require('./routes/todos'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/breaks', require('./routes/breaks'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/links', require('./routes/links'));
app.use('/api/leaves', require('./routes/leaves'));

// example protected route
const authenticate = require('./middleware/auth');
const authorizeRoles = require('./middleware/authorize');

app.get('/api/protected/employee', authenticate, (req, res) => {
  return res.json({ message: 'Hello Employee', user: req.user.email });
});

app.get('/api/protected/admin', authenticate, authorizeRoles('Admin'), (req, res) => {
  return res.json({ message: 'Hello Admin', user: req.user.email });
});

// Socket.io connection
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
