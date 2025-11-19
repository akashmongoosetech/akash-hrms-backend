require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const cron = require('node-cron');
const connectDB = require('./config/db');
const PunchTime = require('./models/PunchTime');
const Report = require('./models/Report');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: ["http://localhost:5173", "https://hrms.sosapient.in", "https://akash-hrms-frontend.onrender.com"], // Frontend URLs for development and production
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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure web-push
webpush.setVapidDetails(
  'mailto:akash.profilics@gmail.com',
  process.env.VAPID_PUBLIC_KEY || 'BHWnf-U3zH5IQarMbSyy1KkDdYFOCcpydYupXT6D06jJArvG5oaeKitn27z7NdlDaOHQu2lqPg4MjYwjX2AKHR0',
  process.env.VAPID_PRIVATE_KEY || 'kEzndMzhvGF7-qIjFkiNYJEO6QyEUqfK92LgSsJNUdc'
);

// routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/departments', require('./routes/departments'));
app.use('/api/holidays', require('./routes/holidays'));
app.use('/api/saturdays', require('./routes/saturdays'));
app.use('/api/events', require('./routes/events'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/teams', require('./routes/teams'));
app.use('/api/todos', require('./routes/todos'));
app.use('/api/tickets', require('./routes/tickets'));
app.use('/api/comments', require('./routes/comments'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/breaks', require('./routes/breaks'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/links', require('./routes/links'));
app.use('/api/leaves', require('./routes/leaves'));
app.use('/api/punches', require('./routes/punches'));
app.use('/api/candidates', require('./routes/candidates'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/invoices', require('./routes/invoices'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/blogs', require('./routes/blogs'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/courses', require('./routes/courses'));
app.use('/api/chats', require('./routes/chats'));

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

  socket.on('join', (userId) => {
    socket.join(userId);
    console.log(`User ${userId} joined room`);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Make io accessible to routes
app.set('io', io);

// Cron job for automatic punch-out at midnight
cron.schedule('0 0 * * *', async () => {
  console.log('Running midnight auto-punch-out job');

  try {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const midnight = new Date(today + 'T00:00:00.000Z'); // Midnight UTC

    // Find all employees still punched in
    const punchedInEmployees = await PunchTime.find({ punchOutTime: null });

    for (const punch of punchedInEmployees) {
      // Auto punch out at midnight
      punch.punchOutTime = midnight;
      punch.totalDuration = midnight.getTime() - punch.punchInTime.getTime();
      await punch.save();

      // Check if report already exists for today
      const existingReport = await Report.findOne({ employee: punch.employee, date: today });
      if (!existingReport) {
        // Create automatic report
        const startTime = punch.punchInTime.toTimeString().slice(0, 5); // HH:MM

        const newReport = new Report({
          employee: punch.employee,
          description: "Your punch-out for today has been automatically recorded by the system due to the absence of a manual punch-out. Please ensure to manually punch out at the end of your day to maintain accurate attendance records.",
          startTime: startTime,
          breakDuration: 0,
          endTime: '00:00',
          workingHours: '07:00',
          totalHours: '07:00',
          date: today,
        });

        await newReport.save();

        // Emit socket event for real-time updates
        const populatedReport = await Report.findById(newReport._id).populate({ path: 'employee', select: 'firstName lastName email photo', match: { status: 'Active' } });
        io.emit('reportCreated', populatedReport);
      }

      // Emit punch-out event
      const user = await User.findById(punch.employee);
      io.emit('punch-out', { employee: user, punchTime: punch });
    }

    console.log(`Auto-punched out ${punchedInEmployees.length} employees`);
  } catch (error) {
    console.error('Error in midnight auto-punch-out job:', error);
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
