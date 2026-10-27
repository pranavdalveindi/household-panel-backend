import { Router } from 'express'
import { authenticate } from '../../middleware/auth'
import { login, refresh, logout, getMe } from './auth.controller'

const router = Router()

router.post('/login', login)
router.post('/refresh', refresh)
router.post('/logout', logout)
router.get('/me', authenticate, getMe)

export default router
