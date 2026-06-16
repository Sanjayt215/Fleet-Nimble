import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/register', authLimiter, auth.register);
router.post('/login', authLimiter, auth.login);
router.post('/logout', auth.logout);
router.post('/refresh', authLimiter, auth.refresh);
router.get('/profile', authenticate, auth.profile);
router.get('/me', authenticate, auth.profile);

export default router;
