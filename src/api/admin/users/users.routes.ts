import { Router } from 'express'
import { requireRole } from '../../../middleware/requireRole'
import { listUsers, createUser, updateUserRole, deleteUser } from './users.controller'

const router = Router()

router.use(requireRole('admin'))

router.get('/', listUsers)
router.post('/', createUser)
router.patch('/:userId', updateUserRole)
router.delete('/:userId', deleteUser)

export default router