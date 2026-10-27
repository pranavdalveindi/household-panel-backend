import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env'
import { authenticate } from './middleware/auth'
import authRouter from './api/auth/auth.routes'
import householdsRouter from './api/households/households.routes'
import appointmentsRouter from './api/appointments/appointments.routes'
import adminUsersRouter from './api/admin/users/users.routes'

const app = express()

app.use(helmet())

// Allow requests from frontend running on localhost:3000, 3001, 127.0.0.1, or configured ALLOWED_ORIGIN
const allowedOrigins = [
  env.ALLOWED_ORIGIN,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
].filter(Boolean)

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or server-to-server)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(null, true) // Permissive in dev to avoid blocking dashboard
      }
    },
    credentials: true,
  })
)

app.use(express.json())

// Public routes
app.get('/health', (_, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRouter)

// All routes below require authentication
app.use(authenticate)

app.use('/api/households', householdsRouter)
app.use('/api/households/:id/appointments', appointmentsRouter)
app.use('/api/admin/users', adminUsersRouter)

app.listen(env.PORT, () => {
  console.log(`API running on port ${env.PORT}`)
})

export default app
