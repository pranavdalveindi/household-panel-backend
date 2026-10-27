import { Router } from 'express'
import { requireRole } from '../../middleware/requireRole'
import { getHouseholds, patchHousehold } from './households.controller'
import { authenticate } from '../../middleware/auth'

const router = Router()

router.get('/',authenticate, getHouseholds)
router.patch('/:id', requireRole('call_center', 'field_executive'), patchHousehold)

export default router