import { useState, useEffect } from "react"
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  TextField,
  Chip,
  Avatar,
  IconButton,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemAvatar,
  ListItemSecondaryAction,
  CircularProgress,
  Alert,
  Snackbar,
  ThemeProvider,
  createTheme,
  CssBaseline,
  AppBar,
  Toolbar,
  Badge,
  Tab,
  Tabs
} from "@mui/material"
import {
  DirectionsCar,
  CloudUpload,
  Image,
  AutoAwesome,
  Facebook,
  Refresh,
  Settings,
  Logout,
  CheckCircle,
  Warning,
  DeleteOutline
} from "@mui/icons-material"
import axios from "axios"

// API URL - hardcoded for reliability in extension context
const API_URL = "https://autobridge-backend.dchatpar.workers.dev/api"

console.log("AutoBridge Sidepanel - API URL:", API_URL)

// Material Design Theme with better colors
const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#667eea",
      light: "#a5b4fc",
      dark: "#4c63d2"
    },
    secondary: {
      main: "#764ba2",
      light: "#9d7bb8",
      dark: "#5a3a7d"
    },
    success: {
      main: "#10b981",
      light: "#34d399",
      dark: "#059669"
    },
    error: {
      main: "#ef4444",
      light: "#f87171",
      dark: "#dc2626"
    },
    warning: {
      main: "#f59e0b",
      light: "#fbbf24",
      dark: "#d97706"
    },
    background: {
      default: "#f8fafc",
      paper: "#ffffff"
    },
    text: {
      primary: "#1e293b",
      secondary: "#64748b"
    }
  },
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    h5: {
      fontWeight: 700
    },
    h6: {
      fontWeight: 600
    },
    button: {
      textTransform: "none",
      fontWeight: 600
    }
  },
  shape: {
    borderRadius: 12
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          boxShadow: "none",
          "&:hover": {
            boxShadow: "0 4px 12px rgba(102, 126, 234, 0.3)"
          }
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          "&:hover": {
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)"
          }
        }
      }
    }
  }
})

interface Vehicle {
  id: string
  vin: string
  year: number
  make: string
  model: string
  price: number
  mileage: number
  images: string[]
  aiDescription?: string
  aiTitle?: string
  status: "ready" | "posting" | "posted" | "sold"
}

function IndexSidepanel() {
  const [token, setToken] = useState<string>("")
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(false)
  const [snackbar, setSnackbar] = useState({ open: false, message: "", severity: "success" as "success" | "error" })
  const [tabValue, setTabValue] = useState(0)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userId, setUserId] = useState("")
  const [password, setPassword] = useState("")

  useEffect(() => {
    // Load token from storage
    chrome.storage.local.get(["authToken"], (result) => {
      if (result.authToken) {
        setToken(result.authToken)
        setIsAuthenticated(true)
        loadVehicles(result.authToken)
      }
    })
  }, [])

  const handleLogin = async () => {
    try {
      setLoading(true)
      console.log("Attempting login to:", `${API_URL}/auth/login`)
      console.log("User ID:", userId)
      
      const response = await axios.post(`${API_URL}/auth/login`, {
        userId,
        password
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      })

      console.log("Login response:", response.data)

      if (response.data.success && response.data.token) {
        const authToken = response.data.token
        setToken(authToken)
        await chrome.storage.local.set({ authToken })
        setIsAuthenticated(true)
        showSnackbar("Login successful!", "success")
        loadVehicles(authToken)
      } else {
        throw new Error(response.data.message || "Login failed - no token received")
      }
    } catch (error: any) {
      console.error("Login error:", error)
      const errorMsg = error.response?.data?.message || error.message || "Login failed - check console"
      showSnackbar("Login failed: " + errorMsg, "error")
    } finally {
      setLoading(false)
    }
  }

  const loadVehicles = async (authToken: string) => {
    try {
      setLoading(true)
      const response = await axios.get(`${API_URL}/vehicles?status=ready`, {
        headers: { Authorization: `Bearer ${authToken}` }
      })
      setVehicles(response.data.vehicles || [])
    } catch (error) {
      showSnackbar("Failed to load vehicles: " + error.message, "error")
    } finally {
      setLoading(false)
    }
  }

  const postToFacebook = async (vehicle: Vehicle) => {
    try {
      // Update vehicle status
      setVehicles((prev) =>
        prev.map((v) => (v.id === vehicle.id ? { ...v, status: "posting" } : v))
      )

      // Send message to content script to fill form
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
      
      chrome.tabs.sendMessage(
        tab.id,
        {
          action: "FILL_FACEBOOK_FORM",
          vehicle: {
            title: vehicle.aiTitle || `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
            price: vehicle.price,
            description: vehicle.aiDescription || "",
            mileage: vehicle.mileage,
            year: vehicle.year,
            vin: vehicle.vin,
            images: vehicle.images
          }
        },
        (response) => {
          if (response?.success) {
            showSnackbar("Form filled successfully!", "success")
            setVehicles((prev) =>
              prev.map((v) => (v.id === vehicle.id ? { ...v, status: "posted" } : v))
            )
          } else {
            showSnackbar("Failed to fill form", "error")
            setVehicles((prev) =>
              prev.map((v) => (v.id === vehicle.id ? { ...v, status: "ready" } : v))
            )
          }
        }
      )
    } catch (error) {
      showSnackbar("Error: " + error.message, "error")
    }
  }

  const enhanceImage = async (vehicleId: string, imageUrl: string) => {
    try {
      showSnackbar("Enhancing image with AI...", "success")
      const response = await axios.post(
        `${API_URL}/ai/enhance-image`,
        { imageUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      showSnackbar("Image enhanced successfully!", "success")
      loadVehicles(token)
    } catch (error) {
      showSnackbar("Image enhancement failed: " + error.message, "error")
    }
  }

  const showSnackbar = (message: string, severity: "success" | "error") => {
    setSnackbar({ open: true, message, severity })
  }

  const handleLogout = () => {
    chrome.storage.local.remove(["authToken"])
    setToken("")
    setIsAuthenticated(false)
    setVehicles([])
  }

  if (!isAuthenticated) {
    return (
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            width: "100%",
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
            p: 3
          }}>
          <Card sx={{ maxWidth: 400, width: "100%" }}>
            <CardContent sx={{ p: 4 }}>
              <Box sx={{ textAlign: "center", mb: 3 }}>
                <Avatar
                  sx={{
                    width: 64,
                    height: 64,
                    margin: "0 auto 16px",
                    bgcolor: "primary.main"
                  }}>
                  <DirectionsCar sx={{ fontSize: 32 }} />
                </Avatar>
                <Typography variant="h5" gutterBottom>
                  AutoBridge Pro
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Sign in to access your vehicle inventory
                </Typography>
              </Box>

              <TextField
                fullWidth
                label="User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                margin="normal"
                variant="outlined"
              />
              <TextField
                fullWidth
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                margin="normal"
                variant="outlined"
                onKeyPress={(e) => e.key === "Enter" && handleLogin()}
              />

              <Button
                fullWidth
                variant="contained"
                size="large"
                onClick={handleLogin}
                disabled={loading}
                sx={{ mt: 3 }}>
                {loading ? <CircularProgress size={24} /> : "Sign In"}
              </Button>
            </CardContent>
          </Card>
        </Box>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ width: "100%", minHeight: "100vh", bgcolor: "background.default" }}>
        {/* App Bar */}
        <AppBar position="sticky" elevation={0} sx={{ background: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" }}>
          <Toolbar>
            <DirectionsCar sx={{ mr: 2 }} />
            <Typography variant="h6" sx={{ flexGrow: 1 }}>
              AutoBridge Pro
            </Typography>
            <IconButton color="inherit" onClick={() => loadVehicles(token)}>
              <Refresh />
            </IconButton>
            <IconButton color="inherit" onClick={handleLogout}>
              <Logout />
            </IconButton>
          </Toolbar>
          <Tabs
            value={tabValue}
            onChange={(e, newValue) => setTabValue(newValue)}
            textColor="inherit"
            indicatorColor="secondary"
            sx={{ bgcolor: "rgba(255,255,255,0.1)" }}>
            <Tab label="Ready to Post" />
            <Tab label="Posted" />
            <Tab label="AI Tools" />
          </Tabs>
        </AppBar>

        {/* Content */}
        <Box sx={{ p: 3 }}>
          {loading && vehicles.length === 0 ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              {/* Tab 0: Ready to Post */}
              {tabValue === 0 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    <Badge badgeContent={vehicles.filter((v) => v.status === "ready").length} color="primary">
                      Ready to Post
                    </Badge>
                  </Typography>
                  <List>
                    {vehicles
                      .filter((v) => v.status === "ready")
                      .map((vehicle) => (
                        <Card key={vehicle.id} sx={{ mb: 2 }}>
                          <CardContent>
                            <Box sx={{ display: "flex", gap: 2 }}>
                              <Avatar
                                variant="rounded"
                                src={vehicle.images[0]}
                                sx={{ width: 80, height: 80 }}>
                                <DirectionsCar />
                              </Avatar>
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="h6">
                                  {vehicle.year} {vehicle.make} {vehicle.model}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" gutterBottom>
                                  VIN: {vehicle.vin}
                                </Typography>
                                <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
                                  <Chip
                                    label={`$${vehicle.price.toLocaleString()}`}
                                    color="success"
                                    size="small"
                                  />
                                  <Chip
                                    label={`${vehicle.mileage.toLocaleString()} mi`}
                                    size="small"
                                  />
                                  <Chip
                                    label={vehicle.aiTitle ? "AI Enhanced" : "Standard"}
                                    color={vehicle.aiTitle ? "secondary" : "default"}
                                    size="small"
                                    icon={vehicle.aiTitle ? <AutoAwesome /> : undefined}
                                  />
                                </Box>
                                <Box sx={{ display: "flex", gap: 1 }}>
                                  <Button
                                    variant="contained"
                                    startIcon={<Facebook />}
                                    onClick={() => postToFacebook(vehicle)}
                                    disabled={vehicle.status === "posting"}
                                    size="small">
                                    {vehicle.status === "posting" ? "Posting..." : "Post to Facebook"}
                                  </Button>
                                  <Button
                                    variant="outlined"
                                    startIcon={<Image />}
                                    onClick={() => enhanceImage(vehicle.id, vehicle.images[0])}
                                    size="small">
                                    Clean Image
                                  </Button>
                                </Box>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      ))}
                  </List>
                </Box>
              )}

              {/* Tab 1: Posted */}
              {tabValue === 1 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Posted Vehicles
                  </Typography>
                  <List>
                    {vehicles
                      .filter((v) => v.status === "posted")
                      .map((vehicle) => (
                        <Card key={vehicle.id} sx={{ mb: 2 }}>
                          <CardContent>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
                              <CheckCircle color="success" />
                              <Box>
                                <Typography variant="body1">
                                  {vehicle.year} {vehicle.make} {vehicle.model}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                  Posted successfully
                                </Typography>
                              </Box>
                            </Box>
                          </CardContent>
                        </Card>
                      ))}
                  </List>
                </Box>
              )}

              {/* Tab 2: AI Tools */}
              {tabValue === 2 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    AI Enhancement Tools
                  </Typography>
                  <Card sx={{ mb: 2 }}>
                    <CardContent>
                      <Typography variant="body1" gutterBottom>
                        <AutoAwesome sx={{ verticalAlign: "middle", mr: 1 }} />
                        Available AI Features:
                      </Typography>
                      <List>
                        <ListItem>
                          <ListItemText
                            primary="Image Enhancement"
                            secondary="Remove backgrounds, adjust lighting, add watermarks"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="Description Generator"
                            secondary="AI-powered compelling descriptions"
                          />
                        </ListItem>
                        <ListItem>
                          <ListItemText
                            primary="Title Optimizer"
                            secondary="SEO-optimized titles for better visibility"
                          />
                        </ListItem>
                      </List>
                    </CardContent>
                  </Card>
                </Box>
              )}
            </>
          )}
        </Box>

        {/* Snackbar */}
        <Snackbar
          open={snackbar.open}
          autoHideDuration={4000}
          onClose={() => setSnackbar({ ...snackbar, open: false })}
          anchorOrigin={{ vertical: "bottom", horizontal: "right" }}>
          <Alert
            onClose={() => setSnackbar({ ...snackbar, open: false })}
            severity={snackbar.severity}
            sx={{ width: "100%" }}>
            {snackbar.message}
          </Alert>
        </Snackbar>
      </Box>
    </ThemeProvider>
  )
}

export default IndexSidepanel
