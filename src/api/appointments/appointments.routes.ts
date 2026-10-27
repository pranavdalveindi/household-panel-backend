import { Router } from 'express'
import { requireRole } from '../../middleware/requireRole'
import { getAppointments, createAppointment, deleteAppointment } from './appointments.controller'

const router = Router({ mergeParams: true })

router.get('/', getAppointments)
router.post('/', requireRole('call_center'), createAppointment)
router.delete('/:appointmentId', requireRole('call_center'), deleteAppointment)

export default router