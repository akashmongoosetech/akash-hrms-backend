const Department = require('../models/Department');
const User = require('../models/User');

const getDepartments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const totalDepartments = await Department.countDocuments();

    // Get departments with employee count
    const departments = await Department.aggregate([
      {
        $lookup: {
          from: 'users',
          let: { departmentId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$department', '$$departmentId'] },
                // Deleted accounts are archived, not active members of the department.
                status: { $ne: 'Deleted' }
              }
            },
            { $project: { _id: 1 } }
          ],
          as: 'employees'
        }
      },
      {
        $addFields: {
          totalAssociateEmployee: { $size: '$employees' }
        }
      },
      {
        $project: {
          employees: 0 // Exclude the employees array from the result
        }
      },
      {
        $sort: { createdAt: -1 }
      },
      {
        $skip: skip
      },
      {
        $limit: limit
      }
    ]);

    res.json({
      departments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalDepartments / limit),
        totalItems: totalDepartments,
        itemsPerPage: limit
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getDepartmentById = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ message: 'Department not found' });
    res.json(department);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

const createDepartment = async (req, res) => {
  try {
    const { name, head } = req.body;

    if (!name || !head) {
      return res.status(400).json({ message: 'Name and head are required' });
    }

    const existing = await Department.findOne({ name });
    if (existing) return res.status(409).json({ message: 'Department name already exists' });

    const department = new Department({ name, head });
    await department.save();

    res.status(201).json({ message: 'Department created successfully', department });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const department = await Department.findByIdAndUpdate(id, updates, { new: true, runValidators: true });
    if (!department) return res.status(404).json({ message: 'Department not found' });

    res.json({ message: 'Department updated successfully', department });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error', error: err.message });
  }
};

const deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);
    if (!department) return res.status(404).json({ message: 'Department not found' });

    // Any role counts: an Employee, HR, Manager, Admin or SuperAdmin tied to this
    // department blocks deletion until they are reassigned. Deleted accounts are
    // ignored because they are archived, not active members.
    const associatedUsers = await User.countDocuments({
      department: id,
      status: { $ne: 'Deleted' }
    });

    if (associatedUsers > 0) {
      return res.status(409).json({
        message: `Cannot delete "${department.name}": ${associatedUsers} ${associatedUsers === 1 ? 'employee is' : 'employees are'} still assigned to this department. Reassign them to another department first.`,
        employeeCount: associatedUsers
      });
    }

    await Department.findByIdAndDelete(id);

    res.json({ message: 'Department deleted successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = { getDepartments, getDepartmentById, createDepartment, updateDepartment, deleteDepartment };