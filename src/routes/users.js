const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');
const { auth } = require('../middleware/auth');
const { validateUserUpdate, validatePasswordChange } = require('../utils/validation');

const router = express.Router();

// @route   GET /api/users
// @desc    Get all users (admin only)
// @access  Private
router.get('/', auth, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. Admin privileges required.'
        }
      });
    }

    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: {
        users: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Private
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Users can only access their own data unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. You can only view your own profile.'
        }
      });
    }

    const result = await pool.query(
      'SELECT id, name, email, role, created_at FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found'
        }
      });
    }

    res.json({
      success: true,
      data: {
        user: result.rows[0]
      }
    });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Private
router.put('/:id', auth, validateUserUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email } = req.body;

    // Users can only update their own data unless they're admin
    if (req.user.role !== 'admin' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. You can only update your own profile.'
        }
      });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found'
        }
      });
    }

    // Check if email is already taken by another user
    if (email) {
      const emailCheck = await pool.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email, id]
      );

      if (emailCheck.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: {
            message: 'Email is already taken'
          }
        });
      }
    }

    // Build update query dynamically
    const updateFields = [];
    const values = [];
    let paramCount = 1;

    if (name) {
      updateFields.push(`name = $${paramCount}`);
      values.push(name);
      paramCount++;
    }

    if (email) {
      updateFields.push(`email = $${paramCount}`);
      values.push(email);
      paramCount++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'No fields to update'
        }
      });
    }

    values.push(id);
    const result = await pool.query(
      `UPDATE users SET ${updateFields.join(', ')}, updated_at = NOW() 
       WHERE id = $${paramCount} 
       RETURNING id, name, email, role, created_at, updated_at`,
      values
    );

    res.json({
      success: true,
      data: {
        user: result.rows[0]
      },
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

// @route   PUT /api/users/:id/password
// @desc    Change user password
// @access  Private
router.put('/:id/password', auth, validatePasswordChange, async (req, res) => {
  try {
    const { id } = req.params;
    const { currentPassword, newPassword } = req.body;

    // Users can only change their own password
    if (req.user.id !== id) {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. You can only change your own password.'
        }
      });
    }

    // Get current user with password
    const result = await pool.query(
      'SELECT id, password FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found'
        }
      });
    }

    const user = result.rows[0];

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Current password is incorrect'
        }
      });
    }

    // Hash new password
    const saltRounds = 12;
    const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1, updated_at = NOW() WHERE id = $2',
      [hashedNewPassword, id]
    );

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

// @route   DELETE /api/users/:id
// @desc    Delete user
// @access  Private
router.delete('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Only admins can delete users, and users can't delete themselves
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: {
          message: 'Access denied. Admin privileges required.'
        }
      });
    }

    if (req.user.id === id) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'You cannot delete your own account'
        }
      });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [id]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          message: 'User not found'
        }
      });
    }

    // Delete user
    await pool.query('DELETE FROM users WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: {
        message: 'Internal server error'
      }
    });
  }
});

module.exports = router; 