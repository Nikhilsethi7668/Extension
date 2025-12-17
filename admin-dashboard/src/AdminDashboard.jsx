import React, { useState, useEffect, useMemo } from 'react';
import { 
  Box, Container, Grid, Paper, Typography, Button, Chip, TextField, 
  Dialog, DialogTitle, DialogContent, DialogActions,
  Card, CardContent, Switch, Divider, InputAdornment, Stack, Alert
} from '@mui/material';
import { Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import {
  Dashboard as DashboardIcon,
  People as PeopleIcon,
  Assessment as AssessmentIcon,
  CheckCircle, Cancel, Refresh,
  DirectionsCar,
  CloudDownload
} from '@mui/icons-material';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import axios from 'axios';
import { format } from 'date-fns';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const api = axios.create({ baseURL: API_URL });

function ListingComposer({ token }) {
  const [vehicleType, setVehicleType] = useState('Car');
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [location, setLocation] = useState('Surrey');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const maxPhotos = 20;
  const maxVideos = 1;

  const handlePhotoFiles = (fileList) => {
    const files = Array.from(fileList || []);
    const remaining = Math.max(0, maxPhotos - photos.length);
    const toAdd = files.slice(0, remaining).filter(f => f.type.startsWith('image/'));
    const enriched = toAdd.map(f => ({ file: f, preview: URL.createObjectURL(f) }));
    setPhotos(prev => [...prev, ...enriched]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) {
      handlePhotoFiles(e.dataTransfer.files);
    }
  };

  const handleVideoFile = (fileList) => {
    const file = Array.from(fileList || [])[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) return;
    setVideo({ file, name: file.name });
  };

  const clearAll = () => {
    setVehicleType('Car');
    setPhotos([]);
    setVideo(null);
    setLocation('Surrey');
    setYear('');
    setMake('');
    setModel('');
    setPrice('');
    setDescription('');
    setError('');
    setSuccess('');
  };

  const validate = () => {
    if (!year || !make || !model || !price) {
      setError('Please fill Year, Make, Model, and Price.');
      return false;
    }
    if (Number.isNaN(Number(year)) || String(year).length < 4) {
      setError('Enter a valid Year (e.g., 2019).');
      return false;
    }
    if (Number.isNaN(Number(price)) || Number(price) <= 0) {
      setError('Enter a valid Price greater than 0.');
      return false;
    }
    setError('');
    return true;
  };

  const localGenerateDescription = () => {
    const parts = [];
    if (year || make || model) parts.push(`Presenting the ${year || ''} ${make || ''} ${model || ''}`.trim());
    if (location) parts.push(`Located in ${location}.`);
    if (price) parts.push(`Priced at $${Number(price).toLocaleString()}.`);
    parts.push('Well-maintained and ready for its next owner.');
    parts.push('Contact for a test drive and more details.');
    setDescription(parts.join(' '));
  };

  const saveDraft = async () => {
    if (!validate()) return;
    setSaving(true);
    setSuccess('');
    try {
      // Attempt to log a draft save for audit
      if (token) {
        await api.post('/logs/activity', { action: 'compose_draft_saved', success: true }, { headers: { Authorization: `Bearer ${token}` } });
      }
      setSuccess('Draft saved locally.');
    } catch (_e) {
      setSuccess('Draft saved locally.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Compose Listing</Typography>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle2" color="text.secondary">Marketplace</Typography>
            <Typography variant="h6">Vehicle for sale</Typography>
          </Grid>
          <Grid item xs={12} md={6} sx={{ textAlign: { xs: 'left', md: 'right' } }}>
            <Typography variant="body2">Dhiraj Chatpar • Listing to Marketplace • Public</Typography>
          </Grid>
        </Grid>
      </Paper>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, mb: 3 }} onDragOver={(e) => { e.preventDefault(); }} onDrop={handleDrop}>
            <Typography variant="h6" sx={{ mb: 1 }}>Photos · {photos.length} / {maxPhotos}  •  Videos · {video ? 1 : 0} / {maxVideos}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Upload photos directly from your phone. Learn more</Typography>

            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 2 }}>
              {photos.map((p, idx) => (
                <Box key={idx} sx={{ width: 96, height: 96, borderRadius: 2, overflow: 'hidden', position: 'relative', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <img src={p.preview} alt={`photo-${idx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </Box>
              ))}
            </Box>

            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" component="label">
                Add Photos
                <input hidden type="file" accept="image/*" multiple onChange={(e) => handlePhotoFiles(e.target.files)} />
              </Button>
              <Button variant="outlined" component="label">
                {video ? 'Replace Video' : 'Add Video'}
                <input hidden type="file" accept="video/*" onChange={(e) => handleVideoFile(e.target.files)} />
              </Button>
              {video && <Typography variant="body2" color="text.secondary">{video.name}</Typography>}
            </Box>
          </Paper>

          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>About this vehicle</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField fullWidth select label="Vehicle type" value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} SelectProps={{ native: true }}>
                  <option value="Car">Car</option>
                  <option value="Truck">Truck</option>
                  <option value="SUV">SUV</option>
                  <option value="Van">Van</option>
                  <option value="Other">Other</option>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField fullWidth label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="Year" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="Make" value={make} onChange={(e) => setMake(e.target.value)} />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField fullWidth label="Model" value={model} onChange={(e) => setModel(e.target.value)} />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth label="Price" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} InputProps={{ startAdornment: <InputAdornment position="start">$</InputAdornment> }} helperText="Enter your price for this vehicle." />
              </Grid>
              <Grid item xs={12}>
                <TextField fullWidth multiline minRows={5} label="Description" value={description} onChange={(e) => setDescription(e.target.value)} helperText="Tell buyers anything else about your vehicle." />
              </Grid>
            </Grid>
            <Box sx={{ display: 'flex', gap: 1, mt: 2, flexWrap: 'wrap' }}>
              <Button variant="contained" onClick={saveDraft} disabled={saving}>Save Draft</Button>
              <Button variant="outlined" onClick={localGenerateDescription}>Generate Description</Button>
              <Button variant="text" color="inherit" onClick={clearAll}>Clear</Button>
            </Box>
            {error && <Paper sx={{ p: 1.5, mt: 2, bgcolor: '#2b1d1e', color: '#ffb4b4' }}>{error}</Paper>}
            {success && <Paper sx={{ p: 1.5, mt: 2, bgcolor: '#1a2b1d', color: '#9be7a5' }}>{success}</Paper>}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Preview</Typography>
            <Paper sx={{ p: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
              <Typography variant="subtitle2" color="text.secondary">Marketplace</Typography>
              <Typography variant="h6" sx={{ mb: 1 }}>{year || 'Year'} {make || 'Make'} {model || 'Model'}</Typography>
              <Typography variant="body2" color="text.secondary">{location || 'Location'} • {vehicleType}</Typography>
              <Typography variant="h5" sx={{ mt: 1 }}>${price ? Number(price).toLocaleString() : '0'}</Typography>
              <Divider sx={{ my: 2 }} />
              <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{description || 'Description will appear here.'}</Typography>
            </Paper>
            <Paper sx={{ p: 2, mt: 2, bgcolor: 'rgba(255,255,255,0.02)' }}>
              <Typography variant="caption" color="text.secondary">
                Marketplace items are public and can be seen by anyone on or off Facebook. Items like animals, drugs, weapons, counterfeits, and other items that infringe intellectual property aren't allowed on Marketplace. See our Commerce Policies.
              </Typography>
            </Paper>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function ScrapeView({ token, api, scrapeUrls, setScrapeUrls, scrapeSource, setScrapeSource, scrapeQueue, setScrapeQueue, scrapeStatus, setScrapeStatus, scrapedJobs = [], editPrompt, setEditPrompt, expandInventory, setExpandInventory, users = [], reloadJobs, jobStatusFilter = '', assignedFilter = '' }) {
  const [busy, setBusy] = useState(false);
  const [visibleCount, setVisibleCount] = useState(24);
  const userOptions = (users || []).filter(u => (u.role || '').toLowerCase() !== 'admin');

  const queueScrape = async () => {
    const urls = (scrapeUrls || '')
      .split(/\n|,|;/)
      .map(u => u.trim())
      .filter(Boolean);
    if (!urls.length) {
      setScrapeStatus('Add at least one URL to scrape.');
      return;
    }
    setBusy(true);
    setScrapeStatus('');
    try {
      // Preferred backend endpoint; falls back to local queue if missing
      const payload = { source: scrapeSource, urls, options: { saveArtifacts: true, expandInventory: !!expandInventory } };
      if (token) {
        await api.post('/scrape/queue', payload, { headers: { Authorization: `Bearer ${token}` } });
        setScrapeStatus('Queued scrape via backend.');
      } else {
        setScrapeStatus('Queued locally (no auth token).');
      }
    } catch (err) {
      setScrapeStatus('Backend scrape endpoint unavailable; keeping items locally.');
    } finally {
      setScrapeQueue(prev => [...prev, { id: Date.now(), source: scrapeSource, urls }]);
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="h4" sx={{ mb: 2 }}>Scrape Listings</Typography>
      <Grid container spacing={3}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Source & URLs</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Paste listing URLs (one per line). Supported: AutoTrader, Cars.com, CarGurus, Facebook Marketplace.</Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} md={6}>
                <TextField
                  select
                  fullWidth
                  label="Source"
                  value={scrapeSource}
                  onChange={(e) => setScrapeSource(e.target.value)}
                  SelectProps={{ native: true }}
                >
                  <option value="auto">Auto-Detect</option>
                  <option value="autotrader">AutoTrader</option>
                  <option value="cars">Cars.com</option>
                  <option value="cargurus">CarGurus</option>
                  <option value="facebook">Facebook Marketplace</option>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ height: '100%' }}>
                  <Switch checked={!!expandInventory} onChange={(e) => setExpandInventory(e.target.checked)} />
                  <Box>
                    <Typography variant="subtitle2">Inventory page (expand)</Typography>
                    <Typography variant="caption" color="text.secondary">If URL is a catalog, enqueue vehicle details.</Typography>
                  </Box>
                </Stack>
              </Grid>
            </Grid>
            <TextField
              fullWidth
              multiline
              minRows={6}
              label="Listing URLs"
              value={scrapeUrls}
              onChange={(e) => setScrapeUrls(e.target.value)}
              placeholder="https://www.autotrader.com/cars-for-sale/vehicledetails.xhtml?listingId=...\nhttps://www.cars.com/vehicledetail/..."
              sx={{ mb: 2 }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={queueScrape} disabled={busy}>Queue Scrape</Button>
              <Button variant="text" onClick={() => setScrapeUrls('')}>Clear</Button>
            </Stack>
            {scrapeStatus && <Alert severity="info" sx={{ mt: 2 }}>{scrapeStatus}</Alert>}
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>Queued Jobs</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Recently queued scrape requests.</Typography>
            <Stack spacing={1}>
              {scrapeQueue.slice(-8).reverse().map(item => (
                <Paper key={item.id} variant="outlined" sx={{ p: 1.5 }}>
                  <Typography variant="subtitle2">{item.source}</Typography>
                  <Typography variant="body2" color="text.secondary">{item.urls.slice(0,2).join(', ')}{item.urls.length > 2 ? ` (+${item.urls.length - 2} more)` : ''}</Typography>
                </Paper>
              ))}
              {!scrapeQueue.length && <Typography variant="body2" color="text.secondary">No jobs yet.</Typography>}
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
                <TextField select size="small" label="Status" value={jobStatusFilter} onChange={(e) => reloadJobs({ status: e.target.value })} SelectProps={{ native: true }}>
                  <option value="">All</option>
                  <option value="queued">Queued</option>
                  <option value="ready">Ready</option>
                </TextField>
                <TextField select size="small" label="Assigned to" value={assignedFilter} onChange={(e) => reloadJobs({ assignedTo: e.target.value })} SelectProps={{ native: true }}>
                  <option value="__all__">All</option>
                  <option value="__unassigned__" disabled>──────────</option>
                  <option value="__none__">Unassigned</option>
                  {userOptions.map(u => (
                    <option key={u.userId} value={u.userId}>{u.userId}</option>
                  ))}
                </TextField>
              </Stack>
              <Button size="small" onClick={() => reloadJobs({})}>Refresh</Button>
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="flex-start" justifyContent="space-between" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h6">Scraped Results</Typography>
                <Typography variant="body2" color="text.secondary">Reviewed payloads before sending to extension. Shows parsed fields and images.</Typography>
              </Box>
              <TextField
                label="Image edit prompt (Gemini/Banana/local)"
                size="small"
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                sx={{ minWidth: 260 }}
              />
            </Stack>
            <Grid container spacing={2}>
              {scrapedJobs.slice(0, visibleCount).map(job => (
                <Grid item xs={12} md={6} key={job.id}>
                  <Paper variant="outlined" sx={{ p: 2, height: '100%' }}>
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                      <Chip size="small" label={job.source || 'unknown'} />
                      <Chip size="small" color={job.status === 'ready' ? 'success' : 'default'} label={job.status || 'queued'} />
                      {job.assignedTo && <Chip size="small" color="primary" label={`Assigned: ${job.assignedTo}`} />}
                    </Stack>
                    <Typography variant="subtitle1">{job.scraped?.year} {job.scraped?.make} {job.scraped?.model}</Typography>
                    <Typography variant="body2" color="text.secondary">Price: {job.scraped?.price || '-'} | VIN: {job.scraped?.vin || '-'}</Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>Mileage: {job.scraped?.mileage || '-'} | URL: {job.url || job.urls?.[0]}</Typography>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', mb: 1 }}>
                      {(job.scraped?.images || []).slice(0, 3).map((img, idx) => (
                        <img key={idx} src={img} alt={`img-${idx}`} style={{ width: 96, height: 64, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(0,0,0,0.08)' }} />
                      ))}
                      {!(job.scraped?.images || []).length && (
                        <Typography variant="body2" color="text.secondary">No images scraped.</Typography>
                      )}
                    </Stack>
                    <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap' }}>
                      <Button size="small" variant="outlined" onClick={async () => {
                        try {
                          await api.patch(`/scrape/jobs/${job.id}`, { status: 'ready' });
                          setScrapeStatus('Marked job ready for extension.');
                          if (reloadJobs) reloadJobs();
                        } catch (err) {
                          setScrapeStatus('Failed to mark ready.');
                        }
                      }}>Mark Ready</Button>
                      <Button size="small" variant="contained" onClick={async () => {
                        if (!job.scraped?.images?.length) { setScrapeStatus('No images to edit.'); return; }
                        try {
                          await api.post('/scrape/edit-images', { urls: job.scraped.images, prompt: editPrompt, jobId: job.id });
                          setScrapeStatus('Image edit triggered.');
                        } catch (err) {
                          setScrapeStatus('Image edit failed.');
                        }
                      }}>Edit Images</Button>
                      <TextField select size="small" label="Assign to" defaultValue={job.assignedTo || ''} onChange={(e) => { job._pendingAssign = e.target.value; }} SelectProps={{ native: true }} sx={{ minWidth: 160 }}>
                        <option value="">Unassigned</option>
                        {userOptions.map(u => (
                          <option key={u.userId} value={u.userId}>{u.userId}</option>
                        ))}
                      </TextField>
                      <Button size="small" onClick={async () => {
                        try {
                          await api.patch(`/scrape/jobs/${job.id}`, { assignedTo: job._pendingAssign || '' });
                          setScrapeStatus('Assignment updated.');
                          if (reloadJobs) reloadJobs();
                        } catch (err) {
                          setScrapeStatus('Failed to assign job.');
                        }
                      }}>Assign</Button>
                    </Stack>
                  </Paper>
                </Grid>
              ))}
              {!scrapedJobs.length && (
                <Grid item xs={12}>
                  <Typography variant="body2" color="text.secondary">No scraped jobs yet. Queue URLs to see parsed results here.</Typography>
                </Grid>
              )}
            </Grid>
            {scrapedJobs.length > visibleCount && (
              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                <Button onClick={() => setVisibleCount(c => c + 24)}>Load more</Button>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}

function AdminDashboard() {
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [users, setUsers] = useState([]);
  const [activityLogs, setActivityLogs] = useState([]);
  const [stats, setStats] = useState({ totalUsers: 0, activePosts: 0, totalPosts: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [view, setView] = useState('dashboard'); // dashboard, users, logs, compose, scrape
  const [createUserDialog, setCreateUserDialog] = useState(false);
  const [newUser, setNewUser] = useState({ userId: '', email: '', password: '', role: 'user' });
  const [geminiApiKey, setGeminiApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [scrapeUrls, setScrapeUrls] = useState('');
  const [scrapeSource, setScrapeSource] = useState('autotrader');
  const [scrapeQueue, setScrapeQueue] = useState([]);
  const [scrapeStatus, setScrapeStatus] = useState('');
  const [scrapedJobs, setScrapedJobs] = useState([]);
  const [editPrompt, setEditPrompt] = useState('');
  const [expandInventory, setExpandInventory] = useState(true);
  const [jobStatusFilter, setJobStatusFilter] = useState('');
  const [assignedFilter, setAssignedFilter] = useState('__all__');
  const reloadJobs = async (opts = {}) => {
    try {
      const status = opts.status !== undefined ? opts.status : jobStatusFilter;
      let assignedTo = opts.assignedTo !== undefined ? opts.assignedTo : assignedFilter;
      if (assignedTo === '__all__') assignedTo = '';
      if (assignedTo === '__none__') assignedTo = '';
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (assignedTo !== undefined && assignedTo !== '__all__' && assignedTo !== '') params.set('assignedTo', assignedTo);
      if (assignedTo === '' && (opts.assignedTo === '__none__' || assignedFilter === '__none__')) params.set('assignedTo', '');
      const qs = params.toString();
      const url = '/scrape/jobs' + (qs ? ('?' + qs) : '');
      const jobsRes = await api.get(url);
      setScrapedJobs(jobsRes.data.jobs || []);
      if (opts.status !== undefined) setJobStatusFilter(opts.status);
      if (opts.assignedTo !== undefined) setAssignedFilter(opts.assignedTo);
    } catch (_e) {}
  };

  useEffect(() => {
    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      loadData();
      // Refresh every 30 seconds
      const interval = setInterval(loadData, 30000);
      return () => clearInterval(interval);
    }
  }, [token]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [usersRes, logsRes, jobsRes] = await Promise.all([
        api.get('/users'),
        api.get('/logs/activity?limit=100'),
        api.get('/scrape/jobs')
      ]);

      setUsers(usersRes.data.users || []);
      setScrapedJobs(jobsRes.data.jobs || []);
      const normalizedLogs = (logsRes.data.logs || []).map(log => ({
        ...log,
        user_id: log.user_id || log.userId,
        timestamp: log.timestamp ? new Date(log.timestamp) : new Date()
      }));
      setActivityLogs(normalizedLogs);

      // Calculate stats
      const totalUsers = (usersRes.data.users || []).length;
      const activePosts = normalizedLogs.filter(log => 
        log.action === 'post_completed' && log.success !== false
      ).length;
      const totalPosts = (usersRes.data.users || []).reduce((sum, user) => sum + (user.totalPosts || user.postCount || 0), 0);

      setStats({ totalUsers, activePosts, totalPosts });

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Unable to load data. Check API URL and auth.');
    }
    setLoading(false);
  };

  const toggleUserStatus = async (userId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      await api.patch(`/users/${userId}/status`, { status: newStatus });
      loadData();
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  };

  const getUserLogs = (userId) => {
    return activityLogs.filter(log => (log.user_id || log.userId) === userId);
  };

  const handleCreateUser = async () => {
    try {
      await api.post('/auth/register', newUser);
      setCreateUserDialog(false);
      setNewUser({ userId: '', email: '', password: '', role: 'user' });
      loadData();
      alert('User created successfully!');
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to create user');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm(`Delete user ${userId}? This cannot be undone.`)) return;
    try {
      await api.delete(`/users/${userId}`);
      loadData();
    } catch (error) {
      alert(error.response?.data?.message || 'Failed to delete user');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setToken(null);
    setUsers([]);
    setActivityLogs([]);
  };

  if (!token) {
    return <LoginPage setToken={setToken} />;
  }

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Sidebar */}
      <Box sx={{ width: 260, bgcolor: '#ffffff', color: 'text.primary', p: 2, borderRight: '1px solid #e5e7eb' }}>
        <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 'bold' }}>
          🚗 AutoBridge Admin
        </Typography>
        <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>Manage users, scrape, logs, and AI</Typography>
        
        <Button 
          fullWidth 
          startIcon={<DashboardIcon />}
          onClick={() => setView('dashboard')}
          sx={{ 
            color: 'text.primary', 
            justifyContent: 'flex-start', 
            mb: 1,
            bgcolor: view === 'dashboard' ? 'rgba(15,98,254,0.18)' : 'transparent'
          }}
        >
          Dashboard
        </Button>
        
        <Button 
          fullWidth 
          startIcon={<PeopleIcon />}
          onClick={() => setView('users')}
          sx={{ 
            color: 'text.primary', 
            justifyContent: 'flex-start', 
            mb: 1,
            bgcolor: view === 'users' ? 'rgba(15,98,254,0.18)' : 'transparent'
          }}
        >
          Users
        </Button>
        
        <Button 
          fullWidth 
          startIcon={<AssessmentIcon />}
          onClick={() => setView('logs')}
          sx={{ 
            color: 'text.primary', 
            justifyContent: 'flex-start', 
            mb: 1,
            bgcolor: view === 'logs' ? 'rgba(15,98,254,0.18)' : 'transparent'
          }}
        >
          Activity Logs
        </Button>

        <Button 
          fullWidth 
          startIcon={<CloudDownload />}
          onClick={() => setView('scrape')}
          sx={{ 
            color: 'text.primary', 
            justifyContent: 'flex-start', 
            mb: 1,
            bgcolor: view === 'scrape' ? 'rgba(15,98,254,0.18)' : 'transparent'
          }}
        >
          Scrape
        </Button>

        <Divider sx={{ my: 2, borderColor: 'rgba(255,255,255,0.08)' }} />

        <Button 
          fullWidth 
          startIcon={<DirectionsCar />}
          onClick={() => setView('compose')}
          sx={{ 
            color: 'text.primary', 
            justifyContent: 'flex-start', 
            mb: 1,
            bgcolor: view === 'compose' ? 'rgba(15,98,254,0.18)' : 'transparent'
          }}
        >
          Compose Listing
        </Button>
      </Box>

      {/* Main Content */}
      <Box sx={{ flex: 1, p: 3 }}>
        <Container maxWidth="xl">
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h5">Admin Console</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Button size="small" startIcon={<Refresh />} onClick={loadData} disabled={loading}>
                Refresh
              </Button>
              <Button size="small" color="error" onClick={handleLogout}>
                Logout
              </Button>
            </Box>
          </Box>
          {error && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: '#fff3e0', color: '#e65100' }}>
              {error}
            </Paper>
          )}
          {view === 'dashboard' && <DashboardView stats={stats} activityLogs={activityLogs} geminiApiKey={geminiApiKey} setGeminiApiKey={setGeminiApiKey} />}
          {view === 'users' && <UsersView users={users} toggleUserStatus={toggleUserStatus} getUserLogs={getUserLogs} onCreateUser={() => setCreateUserDialog(true)} onDeleteUser={handleDeleteUser} />}
          {view === 'logs' && <LogsView logs={activityLogs} />}
          {view === 'compose' && <ListingComposer token={token} />}
          {view === 'scrape' && (
            <ScrapeView
              token={token}
              api={api}
              scrapeUrls={scrapeUrls}
              setScrapeUrls={setScrapeUrls}
              scrapeSource={scrapeSource}
              setScrapeSource={setScrapeSource}
              scrapeQueue={scrapeQueue}
              setScrapeQueue={setScrapeQueue}
              scrapeStatus={scrapeStatus}
              setScrapeStatus={setScrapeStatus}
              scrapedJobs={scrapedJobs}
              editPrompt={editPrompt}
              setEditPrompt={setEditPrompt}
              expandInventory={expandInventory}
              setExpandInventory={setExpandInventory}
              users={users}
              reloadJobs={reloadJobs}
              jobStatusFilter={jobStatusFilter}
              assignedFilter={assignedFilter}
            />
          )}
        </Container>
      </Box>

      {/* Create User Dialog */}
      <Dialog open={createUserDialog} onClose={() => setCreateUserDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New User</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="User ID"
            value={newUser.userId}
            onChange={(e) => setNewUser({...newUser, userId: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Email"
            type="email"
            value={newUser.email}
            onChange={(e) => setNewUser({...newUser, email: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Password"
            type="password"
            value={newUser.password}
            onChange={(e) => setNewUser({...newUser, password: e.target.value})}
            margin="normal"
          />
          <TextField
            fullWidth
            select
            label="Role"
            value={newUser.role}
            onChange={(e) => setNewUser({...newUser, role: e.target.value})}
            margin="normal"
            SelectProps={{ native: true }}
          >
            <option value="user">User</option>
            <option value="admin">Admin</option>
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateUserDialog(false)}>Cancel</Button>
          <Button onClick={handleCreateUser} variant="contained" color="primary">Create User</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function DashboardView({ stats, activityLogs, geminiApiKey, setGeminiApiKey }) {
  // Prepare chart data
  const last7Days = [...Array(7)].map((_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - i));
    return {
      date: format(date, 'MM/dd'),
      posts: activityLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate.toDateString() === date.toDateString() && log.action === 'post_completed';
      }).length
    };
  });

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Dashboard Overview</Typography>
      
      {/* Stats Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#1976d2', color: 'white' }}>
            <CardContent>
              <Typography variant="h3">{stats.totalUsers}</Typography>
              <Typography>Total Users</Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#2e7d32', color: 'white' }}>
            <CardContent>
              <Typography variant="h3">{stats.totalPosts}</Typography>
              <Typography>Total Posts</Typography>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={4}>
          <Card sx={{ bgcolor: '#ed6c02', color: 'white' }}>
            <CardContent>
              <Typography variant="h3">{stats.activePosts}</Typography>
              <Typography>Today's Posts</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Activity Chart */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Posts Last 7 Days</Typography>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={last7Days}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="posts" stroke="#1976d2" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ mb: 1 }}>AI & Integrations</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Store your Gemini API key to unlock AI image edits before sending to the extension.</Typography>
            <TextField
              fullWidth
              type="password"
              label="Gemini API Key"
              value={geminiApiKey}
              onChange={(e) => setGeminiApiKey(e.target.value)}
              placeholder="Paste your Gemini API Key"
              sx={{ mb: 1.5 }}
            />
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={() => {
                localStorage.setItem('geminiApiKey', geminiApiKey);
                alert('Gemini key saved locally for this browser session.');
              }}>Save Key</Button>
              <Button variant="text" onClick={() => {
                setGeminiApiKey('');
                localStorage.removeItem('geminiApiKey');
              }}>Clear</Button>
            </Stack>
          </Paper>
        </Grid>
      </Grid>

      {/* Recent Activity */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Recent Activity</Typography>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>User</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activityLogs.slice(0, 10).map((log, index) => (
                <TableRow key={index}>
                  <TableCell>{format(new Date(log.timestamp), 'MM/dd HH:mm')}</TableCell>
                  <TableCell>{log.user_id || log.userId}</TableCell>
                  <TableCell>
                    <Chip 
                      label={log.action} 
                      size="small" 
                      color={log.action === 'post_completed' ? 'success' : 'default'} 
                    />
                  </TableCell>
                  <TableCell>{log.vehicle_vin || 'N/A'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
}

function UsersView({ users, toggleUserStatus, getUserLogs, onCreateUser, onDeleteUser }) {
  const [selectedUser, setSelectedUser] = useState(null);

  const columns = useMemo(() => ([
    { field: 'userId', headerName: 'User ID', flex: 1, minWidth: 120 },
    { field: 'email', headerName: 'Email', flex: 1.4, minWidth: 160 },
    { field: 'role', headerName: 'Role', width: 110, renderCell: (params) => <Chip label={params.value} size="small" color={params.value === 'admin' ? 'primary' : 'default'} /> },
    { field: 'totalPosts', headerName: 'Posts', width: 90, valueGetter: (params) => params.row.totalPosts || params.row.postCount || 0 },
    { field: 'lastLogin', headerName: 'Last Login', width: 170, valueGetter: (params) => params.row.lastLogin ? format(new Date(params.row.lastLogin), 'MM/dd/yyyy HH:mm') : 'Never' },
    { field: 'status', headerName: 'Status', width: 120, renderCell: (params) => <Chip label={params.value} size="small" color={params.value === 'active' ? 'success' : 'error'} /> },
    {
      field: 'actions',
      headerName: 'Actions',
      width: 200,
      sortable: false,
      renderCell: (params) => (
        <Stack direction="row" spacing={1} alignItems="center">
          <Switch checked={params.row.status === 'active'} onChange={() => toggleUserStatus(params.row.userId, params.row.status)} size="small" />
          <Button size="small" onClick={() => setSelectedUser(params.row)}>Logs</Button>
          <Button size="small" color="error" onClick={() => onDeleteUser(params.row.userId)}>Delete</Button>
        </Stack>
      )
    }
  ]), [toggleUserStatus, onDeleteUser]);

  return (
    <>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h4">User Management</Typography>
        <Button variant="contained" onClick={onCreateUser}>+ Create New User</Button>
      </Box>

      <Paper sx={{ height: 520, p: 1 }}>
        <DataGrid
          rows={(users || []).map(u => ({ id: u.userId, ...u }))}
          columns={columns}
          density="compact"
          disableRowSelectionOnClick
          slots={{ toolbar: GridToolbar }}
          slotProps={{ toolbar: { showQuickFilter: true, quickFilterProps: { debounceMs: 300 } } }}
        />
      </Paper>

      {selectedUser && (
        <Dialog open onClose={() => setSelectedUser(null)} maxWidth="md" fullWidth>
          <DialogTitle>Activity for {selectedUser.userId}</DialogTitle>
          <DialogContent>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Time</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Details</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {getUserLogs(selectedUser.userId).map((log, index) => (
                    <TableRow key={index}>
                      <TableCell>{format(new Date(log.timestamp), 'MM/dd HH:mm:ss')}</TableCell>
                      <TableCell>{log.action}</TableCell>
                      <TableCell>{JSON.stringify(log.details || {})}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedUser(null)}>Close</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}

function LogsView({ logs }) {
  const [filter, setFilter] = useState('');

  const filteredLogs = logs.filter(log => 
    (log.user_id || log.userId || '').includes(filter) || 
    (log.action || '').includes(filter) ||
    (log.vehicle_vin && log.vehicle_vin.includes(filter))
  );

  return (
    <>
      <Typography variant="h4" sx={{ mb: 3 }}>Activity Logs</Typography>
      
      <TextField 
        fullWidth 
        label="Filter logs" 
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        sx={{ mb: 3 }}
      />
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Timestamp</TableCell>
              <TableCell>User ID</TableCell>
              <TableCell>FB Profile</TableCell>
              <TableCell>Action</TableCell>
              <TableCell>Vehicle VIN</TableCell>
              <TableCell>Image Edits</TableCell>
              <TableCell>Success</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredLogs.map((log, index) => (
              <TableRow key={index}>
                <TableCell>{format(new Date(log.timestamp), 'MM/dd/yyyy HH:mm:ss')}</TableCell>
                <TableCell>{log.user_id || log.userId}</TableCell>
                <TableCell>{log.fb_profile_name || 'N/A'}</TableCell>
                <TableCell>
                  <Chip label={log.action} size="small" />
                </TableCell>
                <TableCell>{log.vehicle_vin || 'N/A'}</TableCell>
                <TableCell>
                  {log.image_edit_prompts && log.image_edit_prompts.length > 0 
                    ? `${log.image_edit_prompts.length} edits` 
                    : 'None'}
                </TableCell>
                <TableCell>
                  {log.success === false ? <Cancel color="error" /> : <CheckCircle color="success" />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}

function LoginPage({ setToken }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await api.post('/auth/login', { userId, password });
      if (response.data.success && response.data.token) {
        localStorage.setItem('adminToken', response.data.token);
        api.defaults.headers.common['Authorization'] = `Bearer ${response.data.token}`;
        setToken(response.data.token);
      } else {
        setError('Login failed. Check your credentials.');
      }
    } catch (error) {
      setError(error?.response?.data?.message || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 8 }}>
      <Paper sx={{ p: 4 }}>
        <Typography variant="h4" sx={{ mb: 3 }}>Admin Login</Typography>
        <form onSubmit={handleLogin}>
          <TextField 
            fullWidth 
            label="User ID" 
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            sx={{ mb: 2 }}
          />
          <TextField 
            fullWidth 
            type="password"
            label="Password" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{ mb: 2 }}
          />
          {error && <Typography color="error" sx={{ mb: 2 }}>{error}</Typography>}
          <Button type="submit" variant="contained" fullWidth disabled={loading}>
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </form>
      </Paper>
    </Container>
  );
}

export default AdminDashboard;
