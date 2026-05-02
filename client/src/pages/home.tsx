import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import { apiRequest, setSessionToken, getSessionToken } from "@/lib/queryClient";
import {
  Upload, FileText, Sparkles, Download, Sun, Moon, Loader2,
  ChevronRight, ArrowLeft, Eye, EyeOff, Plus, Trash2, Pencil,
  FolderOpen, LogOut, Settings, ChevronDown, User, CheckCircle2,
  Film, BookOpen, Video, Users, MapPin, Box, Clapperboard,
  Volume2, Crown, Clock, CreditCard, KeyRound, AlertCircle, Link2,
  type LucideIcon,
} from "lucide-react";
import type { DetectedChapter, ConvertedChapter, ScreenplayElementType } from "@shared/schema";
import { DEMO_CHAPTERS, DEMO_CONVERTED } from "@/lib/demo-data";

type Step = "upload" | "scanning" | "dashboard" | "converting" | "viewer";

interface Provider {
  id: "openai" | "anthropic" | "google";
  name: string;
  keyPlaceholder: string;
}

const PROVIDERS: Provider[] = [
  { id: "openai", name: "OpenAI", keyPlaceholder: "sk-..." },
  { id: "anthropic", name: "Anthropic", keyPlaceholder: "sk-ant-..." },
  { id: "google", name: "Google AI", keyPlaceholder: "AIza..." },
];

const GENRES = ["drama", "comedy", "thriller", "horror", "sci-fi", "fantasy", "action", "romance", "documentary"];
const PACING_OPTIONS = ["tight", "standard", "expansive"] as const;
const DIALOGUE_STYLES = ["faithful", "naturalized", "minimal"] as const;
const SCENE_DETAILS = ["minimal", "standard", "detailed"] as const;

const ELEMENT_TYPES: { value: ScreenplayElementType; label: string }[] = [
  { value: "scene_heading", label: "Scene Heading" },
  { value: "action", label: "Action" },
  { value: "character", label: "Character" },
  { value: "dialogue", label: "Dialogue" },
  { value: "parenthetical", label: "Parenthetical" },
  { value: "transition", label: "Transition" },
  { value: "shot", label: "Shot" },
];

const FAQ_ITEMS = [
  { q: "What does Screenplay Forge do?", a: "Screenplay Forge converts prose manuscripts and stories into properly formatted screenplays using AI. It detects chapters, identifies dialogue and action, and outputs industry-standard screenplay format." },
  { q: "What input formats work?", a: "Plain text (.txt) and Word documents (.docx). You can paste text directly or upload files." },
  { q: "How accurate is the conversion?", a: "AI identifies dialogue, action, locations, and transitions. Results are fully editable — use the inline editor to refine any element's text or type." },
  { q: "What export formats are available?", a: "Fountain (.fountain), PDF, and Word (.docx) with industry-standard screenplay formatting." },
  { q: "Which AI providers are supported?", a: "OpenAI (GPT-4o), Anthropic (Claude), and Google AI (Gemini). You can use our platform key during your trial or provide your own API key." },
  { q: "What are the conversion settings?", a: "Genre, Pacing, Dialogue Style, and Scene Detail control how the AI interprets and formats your prose into screenplay elements." },
  { q: "Can I edit the screenplay after conversion?", a: "Yes! Click any element in the screenplay viewer to edit its text or change its type (scene heading, action, dialogue, etc.)." },
  { q: "Where does Screenplay Forge fit in the pipeline?", a: "Between Story Forge (finished narratives) and Manuscript Forge (production readiness scoring)." },
];

export default function Home() {
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();

  // ── Auth State ──
  const [authLoading, setAuthLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"login" | "register" | "forgot" | "reset">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // ── Project State ──
  const [showProjectList, setShowProjectList] = useState(true);
  const [projects, setProjects] = useState<any[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<number | null>(null);
  const [renamingProjectId, setRenamingProjectId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // ── Account State ──
  const [showAccountPage, setShowAccountPage] = useState(false);
  const [subscription, setSubscription] = useState<any>(null);

  // ── App State ──
  const [step, setStep] = useState<Step>("upload");
  const [text, setText] = useState("");
  const [provider, setProvider] = useState<Provider["id"]>("google");
  const [apiKey, setApiKey] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertingChapterNumber, setConvertingChapterNumber] = useState<number | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [convertingAll, setConvertingAll] = useState(false);
  // AbortController for in-flight conversion requests so the user can cancel.
  const conversionAbortRef = useRef<AbortController | null>(null);
  const [convertAllProgress, setConvertAllProgress] = useState(0);

  // ── Screenplay Data ──
  const [detectedChapters, setDetectedChapters] = useState<DetectedChapter[]>([]);
  const [convertedChapters, setConvertedChapters] = useState<Record<number, ConvertedChapter>>({});
  const [selectedChapter, setSelectedChapter] = useState<number | null>(null);

  // ── Conversion Settings ──
  const [genre, setGenre] = useState("drama");
  const [pacing, setPacing] = useState<"tight" | "standard" | "expansive">("standard");
  const [dialogueStyle, setDialogueStyle] = useState<"faithful" | "naturalized" | "minimal">("naturalized");
  const [sceneDetail, setSceneDetail] = useState<"minimal" | "standard" | "detailed">("standard");

  // ── Editor State ──
  const [editingElement, setEditingElement] = useState<{ chapterNumber: number; elementIndex: number } | null>(null);
  const [editingType, setEditingType] = useState<ScreenplayElementType | null>(null);
  const [editingText, setEditingText] = useState("");

  // ── FAQ ──
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ── Story Forge Import ──
  const [sfDialogOpen, setSfDialogOpen] = useState(false);
  const [sfLoading, setSfLoading] = useState(false);
  const [sfProjects, setSfProjects] = useState<any[]>([]);
  const [sfImporting, setSfImporting] = useState<string | null>(null);
  const [autoScanAfterImport, setAutoScanAfterImport] = useState(false);

  // ── Auto-save ref ──
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Auth Check ──
  // Always call /api/auth/me on mount so an HttpOnly session cookie can
  // restore the signed-in user after a hard refresh, even when the
  // in-memory bearer token is gone. Bearer compatibility is preserved.
  useEffect(() => {
    apiRequest("GET", "/api/auth/me")
      .then((r) => r.json())
      .then((data) => { setCurrentUser(data); setIsAuthenticated(true); })
      .catch(() => { setSessionToken(null); })
      .finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    if (window.location.hash.includes("checkout=success")) {
      toast({ title: "Subscription activated!", description: "Thank you for subscribing to Screenplay Forge." });
      window.location.hash = window.location.hash.replace(/[?&]checkout=success/, "");
    }
  }, []);

  // ── Auth Handlers ──
  const handleAuthSubmit = useCallback(async () => {
    setAuthSubmitting(true);
    try {
      if (authMode === "register") {
        const r = await apiRequest("POST", "/api/auth/register", { email: authEmail, password: authPassword, displayName: authName });
        const data = await r.json();
        setSessionToken(data.token); setCurrentUser(data.user); setIsAuthenticated(true);
        toast({ title: "Account created!" });
      } else if (authMode === "login") {
        const r = await apiRequest("POST", "/api/auth/login", { email: authEmail, password: authPassword });
        const data = await r.json();
        setSessionToken(data.token); setCurrentUser(data.user); setIsAuthenticated(true);
        toast({ title: "Welcome back!" });
      } else if (authMode === "forgot") {
        await apiRequest("POST", "/api/auth/forgot-password", { email: authEmail });
        toast({ title: "Reset token generated", description: "Check server logs for the reset token (email not configured)." });
        setAuthMode("reset");
      } else if (authMode === "reset") {
        await apiRequest("POST", "/api/auth/reset-password", { token: resetToken, newPassword });
        toast({ title: "Password reset!", description: "Please log in with your new password." });
        setAuthMode("login");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally { setAuthSubmitting(false); }
  }, [authMode, authEmail, authPassword, authName, resetToken, newPassword, toast]);

  const handleLogout = useCallback(async () => {
    if (currentProjectId) {
      try {
        const state = { text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail };
        await apiRequest("PUT", `/api/projects/${currentProjectId}`, { state });
      } catch {}
    }
    try { await apiRequest("POST", "/api/auth/logout"); } catch {}
    setSessionToken(null); setIsAuthenticated(false); setCurrentUser(null);
    setShowProjectList(true); setShowAccountPage(false); setCurrentProjectId(null);
    setStep("upload"); setDetectedChapters([]); setConvertedChapters({}); setText("");
  }, [currentProjectId, text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail]);

  // ── Project Handlers ──
  const loadProjectList = useCallback(async () => {
    try {
      const r = await apiRequest("GET", "/api/projects");
      const data = await r.json();
      setProjects(Array.isArray(data) ? data : data.projects || []);
    } catch {}
  }, []);

  useEffect(() => { if (isAuthenticated) loadProjectList(); }, [isAuthenticated, loadProjectList]);

  // Load saved API key on login
  useEffect(() => {
    if (!isAuthenticated) return;
    apiRequest("GET", "/api/user/apikey").then(r => r.json()).then(data => {
      if (data.apiKey) setApiKey(data.apiKey);
      if (data.provider) setProvider(data.provider);
    }).catch(() => {});
  }, [isAuthenticated]);

  // Save API key when it changes (debounced)
  const apiKeySaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isAuthenticated || !apiKey) return;
    if (apiKeySaveTimer.current) clearTimeout(apiKeySaveTimer.current);
    apiKeySaveTimer.current = setTimeout(() => {
      apiRequest("POST", "/api/user/apikey", { provider, apiKey }).catch(() => {});
    }, 1500);
    return () => { if (apiKeySaveTimer.current) clearTimeout(apiKeySaveTimer.current); };
  }, [isAuthenticated, provider, apiKey]);

  const openProject = useCallback(async (id: number) => {
    try {
      const r = await apiRequest("GET", `/api/projects/${id}`);
      const proj = await r.json();
      setCurrentProjectId(id);
      const state = typeof proj.state === "string" ? JSON.parse(proj.state) : (proj.state || {});
      setText(state.text || "");
      setProvider(state.provider || "google");
      setApiKey(state.apiKey || "");
      setDetectedChapters(state.detectedChapters || []);
      setConvertedChapters(state.convertedChapters || {});
      setGenre(state.genre || "drama");
      setPacing(state.pacing || "standard");
      setDialogueStyle(state.dialogueStyle || "naturalized");
      setSceneDetail(state.sceneDetail || "standard");
      if (state.detectedChapters?.length && Object.keys(state.convertedChapters || {}).length) {
        setStep("viewer");
        setSelectedChapter(Object.keys(state.convertedChapters)[0] ? Number(Object.keys(state.convertedChapters)[0]) : state.detectedChapters[0]?.number);
      } else if (state.detectedChapters?.length) {
        setStep("dashboard");
      } else {
        setStep("upload");
      }
      setShowProjectList(false);
    } catch (err: any) {
      toast({ title: "Error loading project", description: err.message, variant: "destructive" });
    }
  }, [toast]);

  const createProject = useCallback(async () => {
    if (currentProjectId) {
      try {
        const state = { text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail };
        await apiRequest("PUT", `/api/projects/${currentProjectId}`, { state });
      } catch {}
    }
    try {
      const r = await apiRequest("POST", "/api/projects", { name: "Untitled Project" });
      const proj = await r.json();
      setCurrentProjectId(proj.id);
      setText("");
      setDetectedChapters([]); setConvertedChapters({});
      setGenre("drama"); setPacing("standard"); setDialogueStyle("naturalized"); setSceneDetail("standard");
      setStep("upload"); setShowProjectList(false);
      loadProjectList();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  }, [currentProjectId, text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail, loadProjectList, toast]);

  const handleRenameProject = useCallback(async (id: number) => {
    if (!renameValue.trim()) return;
    try {
      await apiRequest("PATCH", `/api/projects/${id}/rename`, { name: renameValue.trim() });
      setRenamingProjectId(null); setRenameValue(""); loadProjectList();
    } catch {}
  }, [renameValue, loadProjectList]);

  const deleteProject = useCallback(async (id: number) => {
    try {
      await apiRequest("DELETE", `/api/projects/${id}`);
      loadProjectList();
      if (currentProjectId === id) { setCurrentProjectId(null); setShowProjectList(true); }
    } catch {}
  }, [currentProjectId, loadProjectList]);

  const backToProjects = useCallback(async () => {
    if (currentProjectId) {
      try {
        const state = { text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail };
        await apiRequest("PUT", `/api/projects/${currentProjectId}`, { state });
      } catch {}
    }
    setShowProjectList(true); setShowAccountPage(false); setCurrentProjectId(null);
    setStep("upload"); setDetectedChapters([]); setConvertedChapters({}); setText("");
    loadProjectList();
  }, [currentProjectId, text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail, loadProjectList]);

  // ── Auto-save ──
  const saveProject = useCallback(async () => {
    if (!currentProjectId) return;
    const state = { text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail };
    try { await apiRequest("PUT", `/api/projects/${currentProjectId}`, { state }); } catch {}
  }, [currentProjectId, text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail]);

  useEffect(() => {
    if (!currentProjectId) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => saveProject(), 2000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [text, provider, apiKey, detectedChapters, convertedChapters, genre, pacing, dialogueStyle, sceneDetail, saveProject, currentProjectId]);

  // ── Subscription ──
  const loadSubscription = useCallback(async () => {
    try { const r = await apiRequest("GET", "/api/subscription/status"); setSubscription(await r.json()); } catch {}
  }, []);

  useEffect(() => { if (isAuthenticated) loadSubscription(); }, [isAuthenticated, loadSubscription]);

  // ── File Upload ──
  const handleFileUpload = useCallback(async (file: File) => {
    if (file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = () => { setText(reader.result as string); toast({ title: "File loaded", description: file.name }); };
      reader.readAsText(file);
    } else if (file.name.endsWith(".docx")) {
      try {
        const JSZip = (await import("jszip")).default;
        const arrayBuf = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuf);
        const docXml = await zip.file("word/document.xml")?.async("string");
        if (docXml) {
          const textContent = docXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          setText(textContent); toast({ title: "File loaded", description: file.name });
        }
      } catch {
        toast({ title: "Failed to read .docx", description: "Try pasting the text instead.", variant: "destructive" });
      }
    } else {
      toast({ title: "Unsupported file", description: "Upload a .txt or .docx file.", variant: "destructive" });
    }
  }, [toast]);

  // ── Story Forge Import ──
  const handleLoadStoryForgeProjects = useCallback(async () => {
    setSfLoading(true);
    setSfDialogOpen(true);
    setSfProjects([]);
    try {
      const r = await apiRequest("GET", "/api/storyforge/projects");
      const data = await r.json();
      const projects = data.projects || (Array.isArray(data) ? data : []);
      setSfProjects(projects);
      if (projects.length === 0) {
        toast({ title: "No projects found", description: "No Story Forge projects found for your account.", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Story Forge connection failed", description: err.message, variant: "destructive" });
      setSfDialogOpen(false);
    } finally {
      setSfLoading(false);
    }
  }, [toast]);

  const handleImportStoryForgeProject = useCallback(async (project: any) => {
    const projectTitle = project.title || project.name || "Untitled";
    setSfImporting(projectTitle);
    try {
      const r = await apiRequest("GET", `/api/storyforge/chapters?project=${encodeURIComponent(projectTitle)}`);
      const data = await r.json();
      const chapters = data.chapters || (Array.isArray(data) ? data : []);
      if (chapters.length === 0) {
        toast({ title: "No chapters found", description: `"${projectTitle}" has no chapters to import.`, variant: "destructive" });
        setSfImporting(null);
        return;
      }

      // Concatenate chapter contents into manuscript text
      // Story Forge chapters already include their own headers — don't duplicate
      const manuscriptText = chapters
        .map((ch: any) => {
          const content = ch.content || ch.text || ch.body || "";
          return content.trim();
        })
        .filter((c: string) => c.length > 0)
        .join("\n\n---\n\n");

      setText(manuscriptText);

      // Auto-set genre if available
      if (project.genre) {
        const genreLower = project.genre.toLowerCase();
        if (GENRES.includes(genreLower)) {
          setGenre(genreLower);
        }
      }

      // Auto-populate project name
      if (currentProjectId) {
        try {
          await apiRequest("PATCH", `/api/projects/${currentProjectId}/rename`, { name: projectTitle });
          loadProjectList();
        } catch {}
      }

      setSfDialogOpen(false);
      toast({ title: "Imported from Story Forge!", description: `"${projectTitle}" loaded with ${chapters.length} chapters. Scanning now...` });

      // Auto-trigger scan after import via flag
      setAutoScanAfterImport(true);
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setSfImporting(null);
    }
  }, [toast, currentProjectId, loadProjectList]);

  // ── Scan ──
  const handleScan = useCallback(async () => {
    if (!text.trim() || text.length < 50) {
      toast({ title: "Insufficient text", description: "Please provide at least 50 characters.", variant: "destructive" });
      return;
    }
    setIsScanning(true); setStep("scanning");
    try {
      const r = await apiRequest("POST", "/api/scan", { text, provider, apiKey });
      const data = await r.json();
      const chapters = data.chapters || [];
      setDetectedChapters(chapters);
      setStep("dashboard");
      toast({ title: "Scan complete!", description: `Found ${chapters.length} chapters.` });
    } catch (err: any) {
      toast({ title: "Scan failed", description: err.message, variant: "destructive" });
      setStep("upload");
    } finally { setIsScanning(false); }
  }, [text, provider, apiKey, toast]);

  // Auto-scan after Story Forge import
  useEffect(() => {
    if (autoScanAfterImport && text.length >= 50) {
      setAutoScanAfterImport(false);
      handleScan();
    }
  }, [autoScanAfterImport, text, handleScan]);

  // ── Convert ──
  // Per-chapter timeout: most chapters complete in 30–60s on Gemini; 120s leaves
  // headroom for long chapters but kills genuinely hung requests.
  const PER_CHAPTER_TIMEOUT_MS = 120_000;

  const cancelConversion = useCallback(() => {
    if (conversionAbortRef.current) {
      conversionAbortRef.current.abort(new DOMException("User cancelled", "AbortError"));
      conversionAbortRef.current = null;
    }
  }, []);

  const handleConvert = useCallback(async (chapterNumber: number) => {
    // Re-entrancy guard: don't fire a second request while one is in flight.
    if (isConverting || convertingAll) return;
    const chapter = detectedChapters.find(c => c.number === chapterNumber);
    if (!chapter) return;
    const controller = new AbortController();
    conversionAbortRef.current = controller;
    setIsConverting(true);
    setConvertingChapterNumber(chapterNumber);
    try {
      const r = await apiRequest("POST", "/api/convert", {
        text, chapterNumber, chapterTitle: chapter.title,
        provider, apiKey, genre, pacing, dialogueStyle, sceneDetail,
      }, { signal: controller.signal, timeoutMs: PER_CHAPTER_TIMEOUT_MS });
      const data = await r.json();
      const converted = data.converted || data;
      setConvertedChapters(prev => ({ ...prev, [chapterNumber]: converted }));
      setSelectedChapter(chapterNumber);
      setStep("viewer");
      toast({ title: "Conversion complete!", description: `Chapter ${chapterNumber}: ${chapter.title}` });
    } catch (err: any) {
      const isAbort = err?.name === "AbortError" || err?.name === "TimeoutError";
      toast({
        title: isAbort ? "Conversion cancelled" : "Conversion failed",
        description: isAbort ? (err?.message || "Request was aborted") : (err?.message || "Unknown error"),
        variant: "destructive",
      });
    } finally {
      setIsConverting(false);
      setConvertingChapterNumber(null);
      if (conversionAbortRef.current === controller) conversionAbortRef.current = null;
    }
  }, [text, detectedChapters, provider, apiKey, genre, pacing, dialogueStyle, sceneDetail, toast, isConverting, convertingAll]);

  const handleConvertAll = useCallback(async () => {
    if (isConverting || convertingAll) return;
    const unconverted = detectedChapters.filter(c => !convertedChapters[c.number]);
    if (unconverted.length === 0) {
      toast({ title: "All chapters converted", description: "Every chapter already has a screenplay." });
      return;
    }
    const controller = new AbortController();
    conversionAbortRef.current = controller;
    setConvertingAll(true); setConvertAllProgress(0);
    let processed = 0;
    let cancelled = false;
    for (let i = 0; i < unconverted.length; i++) {
      if (controller.signal.aborted) { cancelled = true; break; }
      setConvertAllProgress(i + 1);
      const ch = unconverted[i];
      setConvertingChapterNumber(ch.number);
      try {
        const r = await apiRequest("POST", "/api/convert", {
          text, chapterNumber: ch.number, chapterTitle: ch.title,
          provider, apiKey, genre, pacing, dialogueStyle, sceneDetail,
        }, { signal: controller.signal, timeoutMs: PER_CHAPTER_TIMEOUT_MS });
        const data = await r.json();
        const converted = data.converted || data;
        setConvertedChapters(prev => ({ ...prev, [ch.number]: converted }));
        processed++;
      } catch (err: any) {
        const isAbort = err?.name === "AbortError" || err?.name === "TimeoutError";
        console.error(`Convert chapter ${ch.number} failed:`, err);
        if (isAbort && controller.signal.aborted) { cancelled = true; break; }
        toast({
          title: `Chapter ${ch.number} ${isAbort ? "timed out" : "failed"}`,
          description: err?.message || "Conversion error",
          variant: "destructive",
        });
      }
      if (i < unconverted.length - 1 && !controller.signal.aborted) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    setConvertingAll(false);
    setConvertAllProgress(0);
    setConvertingChapterNumber(null);
    if (conversionAbortRef.current === controller) conversionAbortRef.current = null;
    toast({
      title: cancelled ? "Conversion cancelled" : "All chapters converted",
      description: `${processed} of ${unconverted.length} chapters processed${cancelled ? " before cancel" : ""}.`,
    });
  }, [detectedChapters, convertedChapters, text, provider, apiKey, genre, pacing, dialogueStyle, sceneDetail, toast, isConverting, convertingAll]);

  // ── Export ──
  const handleExport = useCallback(async (format: "fountain" | "pdf" | "docx") => {
    setIsExporting(true);
    try {
      const r = await apiRequest("POST", `/api/export/${format}`, { convertedChapters });
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const ext = format === "pdf" ? "docx" : format;
      a.download = `screenplay.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exported!", description: `Screenplay downloaded as .${ext}` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    } finally { setIsExporting(false); }
  }, [convertedChapters, toast]);

  // ── Inline Editor ──
  const startEditing = useCallback((chapterNumber: number, elementIndex: number) => {
    const ch = convertedChapters[chapterNumber];
    if (!ch) return;
    const el = ch.elements[elementIndex];
    setEditingElement({ chapterNumber, elementIndex });
    setEditingType(el.type);
    setEditingText(el.text);
  }, [convertedChapters]);

  const saveEdit = useCallback(() => {
    if (!editingElement || !editingType) return;
    setConvertedChapters(prev => {
      const ch = { ...prev[editingElement.chapterNumber] };
      const elements = [...ch.elements];
      elements[editingElement.elementIndex] = { type: editingType, text: editingText };
      return { ...prev, [editingElement.chapterNumber]: { ...ch, elements } };
    });
    setEditingElement(null); setEditingType(null); setEditingText("");
  }, [editingElement, editingType, editingText]);

  const cancelEdit = useCallback(() => {
    setEditingElement(null); setEditingType(null); setEditingText("");
  }, []);

  // ── Demo Mode ──
  const loadDemo = useCallback(async () => {
    try {
      const existing = projects.find(p => p.name?.includes("Demo"));
      if (existing) { await openProject(existing.id); return; }
      const r = await apiRequest("POST", "/api/projects", { name: "Demo — Sci-Fi Screenplay" });
      const data = await r.json();
      const demoState = {
        text: "", provider: "google", apiKey: "",
        detectedChapters: DEMO_CHAPTERS,
        convertedChapters: DEMO_CONVERTED,
        genre: "sci-fi", pacing: "standard", dialogueStyle: "naturalized", sceneDetail: "standard",
      };
      await apiRequest("PUT", `/api/projects/${data.id}`, { state: demoState });
      setText(""); setDetectedChapters(DEMO_CHAPTERS); setConvertedChapters(DEMO_CONVERTED);
      setGenre("sci-fi"); setStep("dashboard"); setShowProjectList(false);
      setTimeout(() => setCurrentProjectId(data.id), 500);
      toast({ title: "Demo loaded", description: "Sample screenplay from a sci-fi manuscript." });
    } catch (err: any) {
      toast({ title: "Failed to create demo project", description: err.message, variant: "destructive" });
    }
  }, [toast, projects, openProject]);

  // ── Helpers ──
  const totalWords = detectedChapters.reduce((sum, c) => sum + c.wordCount, 0);
  const totalPages = detectedChapters.reduce((sum, c) => sum + c.estimatedPages, 0);
  const convertedCount = Object.keys(convertedChapters).length;

  // ── Render screenplay element ──
  const renderElement = useCallback((el: { type: ScreenplayElementType; text: string }, chapterNumber: number, index: number) => {
    const isEditing = editingElement?.chapterNumber === chapterNumber && editingElement?.elementIndex === index;

    if (isEditing) {
      return (
        <div key={index} className="my-2 p-3 rounded border border-[#00d4aa]/50 bg-[#1a1b26]" data-testid={`edit-element-${index}`}>
          <div className="flex items-center gap-2 mb-2">
            <select
              className="h-8 text-xs bg-[#12131a] border border-gray-700 text-gray-200 rounded px-2"
              value={editingType || el.type}
              onChange={(e) => setEditingType(e.target.value as ScreenplayElementType)}
            >
              {ELEMENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <Button size="sm" className="h-8 bg-[#00d4aa] hover:bg-[#00b894] text-black text-xs" onClick={saveEdit}>Save</Button>
            <Button size="sm" variant="outline" className="h-8 border-gray-700 text-gray-300 text-xs" onClick={cancelEdit}>Cancel</Button>
          </div>
          <Textarea
            className="bg-[#12131a] border-gray-700 text-white font-mono text-sm min-h-[60px]"
            value={editingText}
            onChange={(e) => setEditingText(e.target.value)}
            autoFocus
          />
        </div>
      );
    }

    const baseClass = "cursor-pointer hover:bg-white/5 rounded px-2 py-1 transition-colors";
    const fontClass = "font-['Courier_Prime','Courier_New',Courier,monospace]";

    switch (el.type) {
      case "scene_heading":
        return (
          <div key={index} className={`${baseClass} mt-6 mb-2`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm font-bold uppercase text-white`}>{el.text}</p>
          </div>
        );
      case "action":
        return (
          <div key={index} className={`${baseClass} mb-2`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm text-gray-200 leading-relaxed`}>{el.text}</p>
          </div>
        );
      case "character":
        return (
          <div key={index} className={`${baseClass} mt-4 mb-0`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm uppercase text-white text-center`} style={{ paddingLeft: "37%" }}>{el.text}</p>
          </div>
        );
      case "dialogue":
        return (
          <div key={index} className={`${baseClass} mb-2`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm text-gray-200`} style={{ paddingLeft: "25%", maxWidth: "75%" }}>{el.text}</p>
          </div>
        );
      case "parenthetical":
        return (
          <div key={index} className={`${baseClass} mb-1`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm italic text-gray-400`} style={{ paddingLeft: "31%", maxWidth: "69%" }}>({el.text})</p>
          </div>
        );
      case "transition":
        return (
          <div key={index} className={`${baseClass} mt-4 mb-4`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm uppercase text-gray-300 text-right`}>{el.text}</p>
          </div>
        );
      case "shot":
        return (
          <div key={index} className={`${baseClass} mt-3 mb-2`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm uppercase font-bold text-gray-300`}>{el.text}</p>
          </div>
        );
      default:
        return (
          <div key={index} className={`${baseClass} mb-2`} onClick={() => startEditing(chapterNumber, index)} data-testid={`element-${index}`}>
            <p className={`${fontClass} text-sm text-gray-200`}>{el.text}</p>
          </div>
        );
    }
  }, [editingElement, editingType, editingText, startEditing, saveEdit, cancelEdit]);

  // ── Auth Loading ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0a0b0d] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#00d4aa]" />
      </div>
    );
  }

  // ── Auth Gate ──
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-[#0a0b0d] flex flex-col items-center justify-center p-4">
        <div className="mb-8 text-center">
          <div className="flex items-center justify-center gap-3 mb-2">
            <img src="./screenplay-forge-logo.svg" alt="Screenplay Forge" className="w-16 h-16 rounded-lg object-contain text-[#00d4aa]" />
            <h1 className="text-4xl font-bold text-white">Screenplay Forge</h1>
          </div>
          <p className="text-gray-400">AI Prose-to-Screenplay Conversion</p>
        </div>

        <Card className="w-full max-w-md bg-[#12131a] border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-center">
              {authMode === "login" && "Sign In"}
              {authMode === "register" && "Create Account"}
              {authMode === "forgot" && "Forgot Password"}
              {authMode === "reset" && "Reset Password"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {authMode === "register" && (
              <div><Label className="text-gray-300">Display Name</Label>
                <Input className="bg-[#1a1b26] border-gray-700 text-white" value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Your name" data-testid="input-name" /></div>
            )}
            {(authMode === "login" || authMode === "register" || authMode === "forgot") && (
              <div><Label className="text-gray-300">Email</Label>
                <Input className="bg-[#1a1b26] border-gray-700 text-white" type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" data-testid="input-email" /></div>
            )}
            {(authMode === "login" || authMode === "register") && (
              <div><Label className="text-gray-300">Password</Label>
                <div className="relative">
                  <Input className="bg-[#1a1b26] border-gray-700 text-white pr-10" type={showPassword ? "text" : "password"} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="••••••••" onKeyDown={(e) => e.key === "Enter" && handleAuthSubmit()} data-testid="input-password" />
                  <button type="button" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div></div>
            )}
            {authMode === "reset" && (
              <>
                <div><Label className="text-gray-300">Reset Token</Label>
                  <Input className="bg-[#1a1b26] border-gray-700 text-white" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Paste token from email/logs" /></div>
                <div><Label className="text-gray-300">New Password</Label>
                  <Input className="bg-[#1a1b26] border-gray-700 text-white" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="••••••••" /></div>
              </>
            )}

            <Button className="w-full bg-[#00d4aa] hover:bg-[#00b894] text-black font-semibold" onClick={handleAuthSubmit} disabled={authSubmitting} data-testid="button-auth-submit">
              {authSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {authMode === "login" && "Sign In"}
              {authMode === "register" && "Create Account"}
              {authMode === "forgot" && "Send Reset Token"}
              {authMode === "reset" && "Reset Password"}
            </Button>

            <div className="text-center text-sm text-gray-400 space-y-1">
              {authMode === "login" && (
                <>
                  <p>Don&apos;t have an account? <button className="text-[#00d4aa] hover:underline" onClick={() => setAuthMode("register")}>Sign up</button></p>
                  <p><button className="text-[#00d4aa] hover:underline" onClick={() => setAuthMode("forgot")}>Forgot password?</button></p>
                </>
              )}
              {authMode === "register" && (
                <p>Already have an account? <button className="text-[#00d4aa] hover:underline" onClick={() => setAuthMode("login")}>Sign in</button></p>
              )}
              {(authMode === "forgot" || authMode === "reset") && (
                <p><button className="text-[#00d4aa] hover:underline" onClick={() => setAuthMode("login")}>Back to sign in</button></p>
              )}
            </div>
          </CardContent>
        </Card>
        <PerplexityAttribution />
      </div>
    );
  }

  // ── Account Page ──
  if (showAccountPage) {
    return (
      <div className="min-h-screen bg-[#0a0b0d] text-white">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="./screenplay-forge-logo.svg" alt="Screenplay Forge" className="w-6 h-6 text-[#00d4aa]" />
            <h1 className="text-xl font-bold">Screenplay Forge</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-300" onClick={backToProjects}><ArrowLeft className="w-4 h-4 mr-1" /> Projects</Button>
            <Button variant="ghost" size="sm" className="text-gray-300" onClick={handleLogout}><LogOut className="w-4 h-4 mr-1" /> Logout</Button>
          </div>
        </header>
        <div className="max-w-2xl mx-auto p-6 space-y-6">
          <h2 className="text-2xl font-bold">Account</h2>

          <Card className="bg-[#12131a] border-gray-800">
            <CardHeader><CardTitle className="text-white flex items-center gap-2"><User className="w-5 h-5" /> Profile</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-gray-300">
              <p><span className="text-gray-500">Name:</span> {currentUser?.display_name || currentUser?.displayName}</p>
              <p><span className="text-gray-500">Email:</span> {currentUser?.email}</p>
              {currentUser?.role === "admin" && <Badge className="bg-purple-500/20 text-purple-300"><Crown className="w-3 h-3 mr-1" /> Admin</Badge>}
            </CardContent>
          </Card>

          <Card className="bg-[#12131a] border-gray-800">
            <CardHeader><CardTitle className="text-white flex items-center gap-2"><KeyRound className="w-5 h-5" /> API Keys</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-300">AI Provider</Label>
                <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
                  <SelectTrigger className="bg-[#1a1b26] border-gray-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-300">API Key</Label>
                <Input className="bg-[#1a1b26] border-gray-700 text-white" type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={PROVIDERS.find((p) => p.id === provider)?.keyPlaceholder || "Leave blank for trial"} autoComplete="off" />
                <p className="text-xs text-gray-500 mt-1">Your key is sent directly to the provider. It is never stored.</p>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-[#12131a] border-gray-800">
            <CardHeader><CardTitle className="text-white flex items-center gap-2"><CreditCard className="w-5 h-5" /> Subscription</CardTitle></CardHeader>
            <CardContent className="space-y-4 text-gray-300">
              {subscription ? (
                <>
                  <div className="flex items-center gap-2">
                    <Badge className={subscription.isAdmin ? "bg-purple-500/20 text-purple-300" : subscription.subscriptionActive ? "bg-green-500/20 text-green-300" : subscription.trialActive ? "bg-yellow-500/20 text-yellow-300" : "bg-red-500/20 text-red-300"}>
                      {subscription.isAdmin ? "Admin" : subscription.subscriptionActive ? "Active" : subscription.trialActive ? "Trial" : "Inactive"}
                    </Badge>
                    {subscription.plan && <span className="text-sm capitalize">{subscription.plan} plan</span>}
                  </div>
                  {subscription.trialActive && !subscription.subscriptionActive && !subscription.isAdmin && (
                    <p className="text-sm"><Clock className="w-4 h-4 inline mr-1" /> {subscription.trialDaysRemaining} trial days remaining</p>
                  )}
                  {!subscription.subscriptionActive && !subscription.isAdmin && (
                    <div className="flex gap-2 pt-2">
                      <Button className="bg-[#00d4aa] hover:bg-[#00b894] text-black" onClick={async () => {
                        try { const r = await apiRequest("POST", "/api/subscription/checkout", { plan: "monthly" }); const data = await r.json(); if (data.url) window.location.href = data.url; } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
                      }}>Monthly — $9.99/mo</Button>
                      <Button className="bg-[#00d4aa] hover:bg-[#00b894] text-black" onClick={async () => {
                        try { const r = await apiRequest("POST", "/api/subscription/checkout", { plan: "yearly" }); const data = await r.json(); if (data.url) window.location.href = data.url; } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
                      }}>Yearly — $99.99/yr</Button>
                    </div>
                  )}
                  {subscription.subscriptionActive && (
                    <Button variant="outline" className="border-gray-700 text-gray-300" onClick={async () => {
                      try { const r = await apiRequest("POST", "/api/subscription/portal"); const data = await r.json(); if (data.url) window.location.href = data.url; } catch (err: any) { toast({ title: "Error", description: err.message, variant: "destructive" }); }
                    }}>Manage Subscription</Button>
                  )}
                </>
              ) : <Loader2 className="w-5 h-5 animate-spin" />}
            </CardContent>
          </Card>
        </div>
        <PerplexityAttribution />
      </div>
    );
  }

  // ── Project List ──
  if (showProjectList) {
    return (
      <div className="min-h-screen bg-[#0a0b0d] text-white">
        <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="./screenplay-forge-logo.svg" alt="Screenplay Forge" className="w-8 h-8 rounded-sm object-contain text-[#00d4aa]" />
            <h1 className="text-xl font-bold">Screenplay Forge</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="text-gray-300" onClick={() => { setShowAccountPage(true); setShowProjectList(false); }}><Settings className="w-4 h-4 mr-1" /> Account</Button>
            <Button variant="ghost" size="sm" className="text-gray-300" onClick={toggleTheme}>{theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</Button>
            <Button variant="ghost" size="sm" className="text-gray-300" onClick={handleLogout}><LogOut className="w-4 h-4 mr-1" /> Logout</Button>
          </div>
        </header>

        <div className="max-w-4xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold">Your Projects</h2>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="border-gray-700 text-gray-300" onClick={loadDemo} data-testid="button-load-demo">
                <Film className="w-4 h-4 mr-1" /> Load Demo
              </Button>
              <Button className="bg-[#00d4aa] hover:bg-[#00b894] text-black" onClick={createProject} data-testid="button-new-project">
                <Plus className="w-4 h-4 mr-1" /> New Project
              </Button>
            </div>
          </div>

          {projects.length === 0 ? (
            <Card className="bg-[#12131a] border-gray-800 border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-gray-400">
                <FileText className="w-12 h-12 mb-4 text-gray-600" />
                <p className="text-lg mb-2">No projects yet</p>
                <p className="text-sm text-gray-500 mb-6 max-w-md text-center">Upload a manuscript to convert it into screenplay format, or try the demo with a sci-fi sample.</p>
                <div className="flex gap-3">
                  <Button variant="outline" className="border-[#00d4aa]/30 text-[#00d4aa] hover:bg-[#00d4aa]/10 font-semibold h-11 px-6" onClick={loadDemo} data-testid="button-try-demo">
                    <Sparkles className="w-4 h-4 mr-2" /> Try Demo
                  </Button>
                  <Button className="bg-[#00d4aa] hover:bg-[#00b894] text-black h-11 px-6" onClick={createProject}>
                    <Plus className="w-4 h-4 mr-2" /> New Project
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {projects.map((p) => (
                <Card key={p.id} className="bg-[#12131a] border-gray-800 hover:border-gray-700 transition-colors cursor-pointer" onClick={() => openProject(p.id)}>
                  <CardContent className="flex items-center justify-between py-4 px-5">
                    <div className="flex items-center gap-3">
                      <FolderOpen className="w-5 h-5 text-[#00d4aa]" />
                      {renamingProjectId === p.id ? (
                        <Input className="bg-[#1a1b26] border-gray-700 text-white h-8 w-64" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} onBlur={() => handleRenameProject(p.id)} onKeyDown={(e) => { if (e.key === "Enter") handleRenameProject(p.id); if (e.key === "Escape") setRenamingProjectId(null); }} onClick={(e) => e.stopPropagation()} autoFocus />
                      ) : (
                        <div>
                          <p className="font-medium">{p.name}</p>
                          <p className="text-xs text-gray-500">{p.chapterCount ? `${p.chapterCount} chapters` : ""} {p.convertedCount ? `· ${p.convertedCount} converted` : ""} {!p.chapterCount && !p.convertedCount ? new Date(p.updated_at || p.updatedAt).toLocaleDateString() : ""}</p>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white" onClick={() => { setRenamingProjectId(p.id); setRenameValue(p.name); }}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="sm" className="text-gray-400 hover:text-red-400" onClick={() => deleteProject(p.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* FAQ */}
          <div className="mt-12">
            <h3 className="text-xl font-bold mb-4">Frequently Asked Questions</h3>
            <div className="space-y-2">
              {FAQ_ITEMS.map((item, i) => (
                <Card key={i} className="bg-[#12131a] border-gray-800">
                  <button className="w-full px-5 py-3 flex items-center justify-between text-left" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                    <span className="font-medium text-gray-200">{item.q}</span>
                    <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${openFaq === i ? "rotate-180" : ""}`} />
                  </button>
                  {openFaq === i && <div className="px-5 pb-4 text-sm text-gray-400">{item.a}</div>}
                </Card>
              ))}
            </div>
          </div>

          {/* Cross-Promotion */}
          <div className="mt-12">
            <h3 className="text-sm font-mono font-semibold tracking-wider uppercase mb-2 text-muted-foreground">The Forge Suite</h3>
            <p className="text-xs text-muted-foreground/70 mb-4">Screenplay Forge is part of a complete AI production toolkit by Little Red Apple Productions.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {([
                { name: "Character Forge", url: "https://character.littleredappleproductions.com", icon: Users, desc: "AI-powered character development with multi-panel portrait studies and 11 art styles." },
                { name: "Location Forge", url: "https://location.littleredappleproductions.com", icon: MapPin, desc: "AI-powered location scouting and environment visualization for film production." },
                { name: "Manuscript Forge", url: "https://manuscript.littleredappleproductions.com", icon: FileText, desc: "Production readiness analysis for screenplays — story structure, character arcs, pacing, and dialogue." },
                { name: "Props Forge", url: "https://props.littleredappleproductions.com", icon: Box, desc: "AI-powered prop identification and visual development from manuscript analysis." },
                { name: "Scene Forge", url: "https://scene.littleredappleproductions.com", icon: Clapperboard, desc: "Scene breakdown and shot lists with 10-section profiles — lighting, sound, VFX, and emotional mapping." },
                { name: "Sound Forge", url: "https://sound.littleredappleproductions.com", icon: Volume2, desc: "AI-powered sound design analysis — detect sound cues, build 12-section profiles, and generate audio." },
                { name: "Story Forge", url: "https://story-forge.littleredappleproductions.com", icon: BookOpen, desc: "AI-assisted story development and screenplay writing with structured narrative tools." },
                { name: "Production Forge", url: "https://github.com/wbraddock-edu/production-forge", icon: Video, desc: "Unified production pipeline — clip generation, voice performance, and motion animation." },
              ] as { name: string; url: string; icon: LucideIcon; desc: string }[]).map((mod) => (
                <a key={mod.name} href={mod.url} target="_blank" rel="noopener noreferrer" className="block rounded-lg p-4 bg-card border border-border hover:border-[#00d4aa]/40 transition-colors">
                  <div className="flex items-center gap-2 mb-2">
                    <mod.icon className="w-4 h-4 text-[#00d4aa]" />
                    <span className="text-xs font-semibold text-foreground">{mod.name}</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">{mod.desc}</p>
                </a>
              ))}
            </div>
          </div>
        </div>
        <PerplexityAttribution />
      </div>
    );
  }

  // ── Main App ──
  return (
    <div className="min-h-screen bg-[#0a0b0d] text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="./screenplay-forge-logo.svg" alt="Screenplay Forge" className="w-8 h-8 rounded-sm object-contain text-[#00d4aa]" />
          <h1 className="text-xl font-bold">Screenplay Forge</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-gray-300" onClick={backToProjects}><ArrowLeft className="w-4 h-4 mr-1" /> Projects</Button>
          <Button variant="ghost" size="sm" className="text-gray-300" onClick={async () => { await saveProject(); setShowAccountPage(true); setShowProjectList(false); }}><Settings className="w-4 h-4 mr-1" /> Account</Button>
          <Button variant="ghost" size="sm" className="text-gray-300" onClick={toggleTheme}>{theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}</Button>
          <Button variant="ghost" size="sm" className="text-gray-300" onClick={handleLogout}><LogOut className="w-4 h-4 mr-1" /> Logout</Button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {/* ── Upload Step ── */}
        {step === "upload" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-2">Upload Your Manuscript</h2>
              <p className="text-gray-400">Paste your prose text to scan for chapters and convert to screenplay format.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="bg-[#12131a] border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><FileText className="w-4 h-4 text-[#00d4aa]" /> Source Text</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border-2 border-dashed border-gray-700 rounded-lg p-6 text-center cursor-pointer hover:border-[#00d4aa]/50 transition-colors"
                    onClick={() => document.getElementById('file-upload-input')?.click()}
                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const file = e.dataTransfer.files[0]; if (file) handleFileUpload(file); }}>
                    <Upload className="w-6 h-6 mx-auto mb-2 text-gray-500" />
                    <p className="text-sm text-gray-400">Drop a .txt or .docx file, or click to browse</p>
                    <input id="file-upload-input" type="file" accept=".txt,.docx" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleFileUpload(file); e.target.value = ""; }} data-testid="input-file-upload" />
                  </div>
                  <Textarea className="bg-[#1a1b26] border-gray-700 text-white min-h-[250px] font-mono text-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Or paste your manuscript here..." data-testid="textarea-manuscript" />
                  <p className="text-xs text-gray-500">{text.length.toLocaleString()} characters</p>
                </CardContent>
              </Card>

              <Card className="bg-[#12131a] border-gray-800">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2"><Sparkles className="w-4 h-4 text-[#00d4aa]" /> AI Configuration</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label className="text-gray-300">AI Provider</Label>
                    <Select value={provider} onValueChange={(v: any) => setProvider(v)}>
                      <SelectTrigger className="bg-[#1a1b26] border-gray-700 text-white"><SelectValue /></SelectTrigger>
                      <SelectContent>{PROVIDERS.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-gray-300">API Key</Label>
                    <Input className="bg-[#1a1b26] border-gray-700 text-white" type="text" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={PROVIDERS.find((p) => p.id === provider)?.keyPlaceholder || "Leave blank for trial"} autoComplete="off" data-testid="input-api-key" />
                    <p className="text-xs text-gray-500 mt-1">Your key is sent directly to the provider. It is never stored.</p>
                  </div>
                  <Separator className="bg-gray-800" />
                  <div className="text-xs text-gray-500 space-y-1">
                    <p className="font-semibold text-gray-400">How it works</p>
                    <p>1. AI scans your text and identifies chapters/sections</p>
                    <p>2. Choose conversion settings (genre, pacing, dialogue style)</p>
                    <p>3. Convert chapters to properly formatted screenplay</p>
                    <p>4. Edit inline — change text or element types</p>
                    <p>5. Export as Fountain, PDF, or DOCX</p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex items-center gap-2 text-xs text-gray-500 justify-center">
              <Separator className="bg-gray-800 flex-1" />
              <span>or import from</span>
              <Separator className="bg-gray-800 flex-1" />
            </div>

            <Button className="w-full bg-teal-700 hover:bg-teal-600 text-white font-semibold h-12 text-base border border-teal-600" onClick={handleLoadStoryForgeProjects} disabled={sfLoading}>
              {sfLoading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Link2 className="w-5 h-5 mr-2" />}
              {sfLoading ? "Connecting to Story Forge..." : "Load My Story Forge Projects"}
            </Button>

            <Button className="w-full bg-[#00d4aa] hover:bg-[#00b894] text-black font-semibold h-12 text-base" onClick={handleScan} disabled={isScanning || text.length < 50} data-testid="button-scan">
              {isScanning ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <FileText className="w-5 h-5 mr-2" />}
              {isScanning ? "Scanning..." : "Scan for Chapters"}
            </Button>

            {/* Story Forge Project Selection Dialog */}
            <Dialog open={sfDialogOpen} onOpenChange={setSfDialogOpen}>
              <DialogContent className="bg-[#12131a] border-gray-800 text-white max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-white">
                    <Link2 className="w-5 h-5 text-[#00d4aa]" />
                    Import from Story Forge
                  </DialogTitle>
                  <DialogDescription className="text-gray-400">
                    Select a project to import its chapters as your manuscript text.
                  </DialogDescription>
                </DialogHeader>
                {sfLoading ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 className="w-10 h-10 animate-spin text-[#00d4aa]" />
                    <p className="text-gray-400 text-sm">Connecting to Story Forge...</p>
                  </div>
                ) : sfProjects.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-50" />
                    <p>No projects found in your Story Forge account.</p>
                  </div>
                ) : (
                  <div className="space-y-3 mt-2">
                    {sfProjects.map((proj: any, idx: number) => (
                      <button
                        key={proj.id || idx}
                        className="w-full text-left p-4 rounded-lg bg-[#1a1b26] border border-gray-700 hover:border-[#00d4aa]/50 hover:bg-[#1a1b26]/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => handleImportStoryForgeProject(proj)}
                        disabled={!!sfImporting}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white truncate">{proj.title || proj.name || "Untitled"}</h3>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              {(proj.genre) && (
                                <Badge variant="outline" className="border-gray-600 text-gray-400 text-xs">{proj.genre}</Badge>
                              )}
                              {(proj.chapterCount || proj.chapter_count) && (
                                <span className="text-xs text-gray-500">{proj.chapterCount || proj.chapter_count} chapters</span>
                              )}
                            </div>
                          </div>
                          <div className="flex-shrink-0">
                            {sfImporting === (proj.title || proj.name) ? (
                              <Loader2 className="w-5 h-5 animate-spin text-[#00d4aa]" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-500" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
        )}

        {/* ── Scanning Step ── */}
        {step === "scanning" && (
          <div className="max-w-lg mx-auto text-center space-y-6 mt-20">
            <Loader2 className="w-16 h-16 animate-spin text-[#00d4aa] mx-auto" />
            <h2 className="text-2xl font-bold">Scanning Manuscript</h2>
            <p className="text-gray-400">AI is analyzing your text to identify chapters and sections...</p>
            <Progress value={50} className="h-2" />
          </div>
        )}

        {/* ── Dashboard Step ── */}
        {step === "dashboard" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">Chapter Dashboard</h2>
                <p className="text-gray-400">{detectedChapters.length} chapters · {totalWords.toLocaleString()} words · ~{totalPages} pages</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => setStep("upload")}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
                <Button className="bg-[#00d4aa] hover:bg-[#00b894] text-black font-semibold" onClick={handleConvertAll} disabled={convertingAll || isConverting} data-testid="button-convert-all">
                  {convertingAll ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
                  {convertingAll ? `Converting ${convertAllProgress}/${Math.max(0, detectedChapters.length - convertedCount + convertAllProgress - 1)}…` : `Convert All (${Math.max(0, detectedChapters.length - convertedCount)} remaining)`}
                </Button>
                {(convertingAll || isConverting) && (
                  <Button variant="outline" className="border-red-700 text-red-400 hover:bg-red-950 hover:text-red-300" onClick={cancelConversion} data-testid="button-cancel-convert">
                    Cancel
                  </Button>
                )}
                {convertedCount > 0 && (
                  <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => { setStep("viewer"); setSelectedChapter(Number(Object.keys(convertedChapters)[0])); }}>
                    <FileText className="w-4 h-4 mr-1" /> View Screenplay
                  </Button>
                )}
              </div>
            </div>

            {/* Conversion Settings */}
            <Card className="bg-[#12131a] border-gray-800">
              <CardHeader className="pb-3"><CardTitle className="text-sm text-gray-300">Conversion Settings</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Genre</Label>
                  <div className="flex flex-wrap gap-2">
                    {GENRES.map(g => (
                      <button key={g} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${genre === g ? "bg-[#00d4aa] text-black" : "bg-[#1a1b26] text-gray-400 hover:text-white border border-gray-700"}`} onClick={() => setGenre(g)} data-testid={`genre-${g}`}>{g.charAt(0).toUpperCase() + g.slice(1)}</button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Pacing</Label>
                    <div className="flex gap-2">
                      {PACING_OPTIONS.map(p => (
                        <button key={p} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-1 ${pacing === p ? "bg-[#00d4aa] text-black" : "bg-[#1a1b26] text-gray-400 hover:text-white border border-gray-700"}`} onClick={() => setPacing(p)}>{p.charAt(0).toUpperCase() + p.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Dialogue Style</Label>
                    <div className="flex gap-2">
                      {DIALOGUE_STYLES.map(d => (
                        <button key={d} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-1 ${dialogueStyle === d ? "bg-[#00d4aa] text-black" : "bg-[#1a1b26] text-gray-400 hover:text-white border border-gray-700"}`} onClick={() => setDialogueStyle(d)}>{d.charAt(0).toUpperCase() + d.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs uppercase tracking-wider mb-2 block">Scene Detail</Label>
                    <div className="flex gap-2">
                      {SCENE_DETAILS.map(s => (
                        <button key={s} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex-1 ${sceneDetail === s ? "bg-[#00d4aa] text-black" : "bg-[#1a1b26] text-gray-400 hover:text-white border border-gray-700"}`} onClick={() => setSceneDetail(s)}>{s.charAt(0).toUpperCase() + s.slice(1)}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chapter Grid */}
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {detectedChapters.map((ch) => {
                const isConverted = !!convertedChapters[ch.number];
                return (
                  <Card key={ch.number} className="bg-[#12131a] border-gray-800 hover:border-gray-700 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[#00d4aa] font-mono text-sm">Ch. {ch.number}</span>
                          {isConverted && <Badge className="bg-green-500/20 text-green-300 text-xs"><CheckCircle2 className="w-3 h-3 mr-1" /> Converted</Badge>}
                        </div>
                      </div>
                      <CardTitle className="text-white text-base">{ch.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-gray-400 mb-3 line-clamp-2">{ch.briefSummary}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
                        <span>{ch.wordCount.toLocaleString()} words</span>
                        <span>~{ch.estimatedPages} pages</span>
                      </div>
                      <Button size="sm" className={isConverted ? "bg-gray-700 hover:bg-gray-600 text-white w-full" : "bg-[#00d4aa] hover:bg-[#00b894] text-black w-full"} onClick={() => {
                        if (isConverted) { setSelectedChapter(ch.number); setStep("viewer"); }
                        else handleConvert(ch.number);
                      }} disabled={(isConverting || convertingAll) && !isConverted} data-testid={`button-convert-${ch.number}`}>
                        {convertingChapterNumber === ch.number && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                        {isConverted
                          ? (<>View Screenplay <ChevronRight className="w-4 h-4 ml-1" /></>)
                          : convertingChapterNumber === ch.number
                            ? (<>Converting…</>)
                            : (isConverting || convertingAll)
                              ? (<>Waiting…</>)
                              : (<>Convert to Screenplay <Sparkles className="w-4 h-4 ml-1" /></>)}
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Converting Step ── */}
        {step === "converting" && (
          <div className="max-w-lg mx-auto text-center space-y-6 mt-20">
            <Loader2 className="w-16 h-16 animate-spin text-[#00d4aa] mx-auto" />
            <h2 className="text-2xl font-bold">Converting to Screenplay</h2>
            <p className="text-gray-400">AI is formatting prose into screenplay elements...</p>
            <Progress value={60} className="h-2" />
          </div>
        )}

        {/* ── Viewer Step ── */}
        {step === "viewer" && (
          <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-bold">Screenplay</h2>
                <p className="text-gray-400">{convertedCount} chapter{convertedCount !== 1 ? "s" : ""} converted</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => setStep("dashboard")}><ArrowLeft className="w-4 h-4 mr-1" /> Dashboard</Button>
                <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => handleExport("fountain")} disabled={isExporting} data-testid="button-export-fountain">
                  <Download className="w-4 h-4 mr-1" /> .fountain
                </Button>
                <Button variant="outline" className="border-gray-700 text-gray-300" onClick={() => handleExport("docx")} disabled={isExporting} data-testid="button-export-docx">
                  <Download className="w-4 h-4 mr-1" /> .docx
                </Button>
                <Button className="bg-[#00d4aa] hover:bg-[#00b894] text-black" onClick={() => handleExport("pdf")} disabled={isExporting} data-testid="button-export-pdf">
                  {isExporting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Download className="w-4 h-4 mr-1" />}
                  Export PDF
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              {/* Chapter Sidebar */}
              <div className="lg:col-span-1 space-y-2">
                <p className="text-sm font-semibold text-gray-400 mb-2">Chapters</p>
                {detectedChapters.map((ch) => {
                  const isConverted = !!convertedChapters[ch.number];
                  const isThisConverting = isConverting && convertingChapterNumber === ch.number;
                  const isAnyConverting = isConverting || convertingAll;
                  const isDisabled = isAnyConverting && !isConverted;
                  return (
                    <button key={ch.number}
                      type="button"
                      disabled={isDisabled}
                      aria-busy={isThisConverting}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors min-h-[44px] ${selectedChapter === ch.number ? "bg-[#00d4aa]/20 text-[#00d4aa] border border-[#00d4aa]/30" : isConverted ? "bg-[#12131a] text-gray-300 hover:bg-[#1a1b26] border border-transparent" : "bg-[#12131a] text-gray-500 hover:bg-[#1a1b26] border border-transparent"} ${isDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
                      onClick={() => {
                        if (isConverted) {
                          setSelectedChapter(ch.number);
                        } else if (!isAnyConverting) {
                          handleConvert(ch.number);
                        }
                      }}
                      data-testid={`sidebar-chapter-${ch.number}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-gray-500">Ch.{ch.number}</span>
                        {isConverted && <CheckCircle2 className="w-3 h-3 text-green-400" />}
                        {isThisConverting && <Loader2 className="w-3 h-3 text-[#00d4aa] animate-spin" />}
                      </div>
                      <p className="truncate">{ch.title}</p>
                      {!isConverted && (
                        isThisConverting ? (
                          <p className="text-xs text-[#00d4aa]">Converting…</p>
                        ) : isAnyConverting ? (
                          <p className="text-xs text-gray-500">Waiting…</p>
                        ) : (
                          <p className="text-xs text-[#00d4aa]">Click to convert</p>
                        )
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Screenplay Viewer */}
              <div className="lg:col-span-3">
                {selectedChapter && convertedChapters[selectedChapter] ? (
                  <div>
                    <Card className="bg-card border border-border">
                      <CardHeader className="border-b border-border">
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="text-white font-['Courier_Prime','Courier_New',Courier,monospace]">
                              Chapter {convertedChapters[selectedChapter].chapterNumber}: {convertedChapters[selectedChapter].chapterTitle}
                            </CardTitle>
                            <p className="text-xs text-gray-500 mt-1">
                              {convertedChapters[selectedChapter].sceneCount} scenes · {convertedChapters[selectedChapter].pageCount} pages · {convertedChapters[selectedChapter].elements.length} elements
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">Click any element to edit</p>
                        </div>
                      </CardHeader>
                      <CardContent className="p-8" data-testid="screenplay-viewer">
                        {convertedChapters[selectedChapter].elements.map((el, i) => renderElement(el, selectedChapter, i))}
                      </CardContent>
                    </Card>
                  </div>
                ) : (
                  <Card className="bg-[#12131a] border-gray-800 border-dashed">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-gray-400">
                      <FileText className="w-12 h-12 mb-4 text-gray-600" />
                      <p>Select a chapter from the sidebar to view its screenplay.</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <PerplexityAttribution />
    </div>
  );
}
