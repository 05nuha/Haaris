// Haaris API client — talks to the FastAPI backend on localhost:8000.
import axios from 'axios'

export const api = axios.create({
  baseURL: 'http://localhost:8000',
  timeout: 300000, // local models can be slow on first load
})

export const analyzePair = (prompt, response) =>
  api.post('/api/analyze', { prompt, response }).then((r) => r.data)

export const fetchHistory = (limit = 50) =>
  api.get('/api/history', { params: { limit } }).then((r) => r.data)

export const fetchAnalysis = (analysisId) =>
  api.get(`/api/analysis/${analysisId}`).then((r) => r.data)

export const reportUrl = (reportId) =>
  `http://localhost:8000/api/report/${reportId}`

export const downloadReport = async (reportId) => {
  const res = await api.get(`/api/report/${reportId}`, { responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = `haaris_compliance_report_${reportId}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
