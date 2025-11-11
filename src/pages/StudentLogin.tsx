import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'
import { studentLogin, saveStudentSession } from '@/lib/students'

export default function StudentLogin() {
  const [roll, setRoll] = useState('') // roll number only
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()
  const navigate = useNavigate()

  const onSubmit = async () => {
    if (!roll.trim() || !password) return
    try {
      setLoading(true)
      const student = await studentLogin(roll.trim(), password)
      if (!student) {
        toast({ title: 'Invalid credentials', description: 'Check roll number & password', variant: 'destructive' })
        return
      }
      saveStudentSession(student)
      navigate('/student')
    } catch (e: any) {
      toast({ title: 'Login failed', description: e?.message || 'Try again', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 via-white to-sky-50 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-lg">Student Login</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="roll">Roll Number</Label>
            <Input id="roll" value={roll} onChange={(e)=>setRoll(e.target.value)} placeholder="e.g. 22CSE123"/>
          </div>
          <div>
            <Label htmlFor="pwd">Password</Label>
            <Input id="pwd" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} placeholder="Enter password"/>
          </div>
          <div className="pt-2">
            <Button className="w-full" disabled={loading || !roll || !password} onClick={onSubmit}>{loading ? 'Signing in…' : 'Sign in'}</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
