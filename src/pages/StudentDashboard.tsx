import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { loadStudentSession, clearStudentSession, getRouteOverview, RouteOverview } from '@/lib/students'

export default function StudentDashboard() {
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState<RouteOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const s = loadStudentSession()
    if (!s) { navigate('/student/login'); return }
    const run = async () => {
      try {
        setLoading(true)
        setError(null)
        if (s.route_id) {
          const ro = await getRouteOverview(s.route_id)
          setRoute(ro)
        } else {
          setRoute(null)
        }
      } catch (e: any) {
        setError(e?.message || 'Failed to load')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [navigate])

  const logout = () => {
    clearStudentSession()
    navigate('/student/login')
  }

  const s = loadStudentSession()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50 p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xl font-semibold">Welcome{ s?.full_name ? `, ${s.full_name}` : ''}</div>
            <div className="text-xs text-slate-500">Roll No: {s?.roll_no || '—'}</div>
          </div>
          <div><Button variant="secondary" size="sm" onClick={logout}>Logout</Button></div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Your Route & Bus</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div>Loading…</div>
            ) : error ? (
              <div className="text-destructive text-sm">{error}</div>
            ) : route ? (
              <div className="space-y-2">
                <div className="text-sm"><span className="text-slate-500">Route:</span> <span className="font-medium">{route.route_name}</span></div>
                <div className="text-sm"><span className="text-slate-500">Current Bus:</span> <span className="font-semibold">{route.current_bus?.bus_number || 'Not Assigned'}</span></div>
                <div className="text-sm"><span className="text-slate-500">Stops:</span> <span>{(route.stops||[]).map(s=>s.name).join(' • ') || '—'}</span></div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">No route assigned.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
