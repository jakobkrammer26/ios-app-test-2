import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON body limits to handle image uploads
app.use(express.json({ limit: "10mb" }));

// Type definition for User
interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string; // clear text for simple sandboxed simulation
  erstelltAm: string;
}

// Type definition for Account (Zahlungskonto)
interface Account {
  id: string;
  userId: string;
  name: string;
  kontotyp: "Bankkonto" | "Kreditkarte" | "Bargeld" | "Online-Konto";
  startguthaben: number;
  farbe: string; // Tailwind bg color base, e.g. "indigo", "amber", "emerald", "sky"
  erstelltAm: string;
}

// Type definition for Receipt
interface Receipt {
  id: string;
  userId: string;
  geschaeft: string;
  datum: string; // TT.MM.JJJJ
  gesamtbetrag: number; // in Euro
  kategorie: "Fahrtkosten" | "Büro" | "Essen" | "Sonstiges";
  image?: string; // base64 or URL
  bemerkung?: string;
  kontoId: string; // Linked account ID
  erstelltAm: string;
}

// Default accounts
const DEFAULT_ACCOUNTS: Account[] = [
  { id: "acc_1", userId: "user_demo", name: "Hauptkonto (Spk)", kontotyp: "Bankkonto", startguthaben: 2500.00, farbe: "indigo", erstelltAm: new Date().toISOString() },
  { id: "acc_2", userId: "user_demo", name: "Kreditkarte (Visa)", kontotyp: "Kreditkarte", startguthaben: 1000.00, farbe: "amber", erstelltAm: new Date().toISOString() },
  { id: "acc_3", userId: "user_demo", name: "Portemonnaie (Bar)", kontotyp: "Bargeld", startguthaben: 150.00, farbe: "emerald", erstelltAm: new Date().toISOString() }
];

// Default initial receipts linked to default accounts
const DEFAULT_RECEIPTS: Receipt[] = [
  {
    id: "rec_1",
    userId: "user_demo",
    geschaeft: "Aral Tankstelle",
    datum: "12.06.2026",
    gesamtbetrag: 64.50,
    kategorie: "Fahrtkosten",
    kontoId: "acc_2", // Kreditkarte
    erstelltAm: new Date("2026-06-12T08:30:00Z").toISOString(),
    bemerkung: "Firmenwagen getankt Super E10"
  },
  {
    id: "rec_2",
    userId: "user_demo",
    geschaeft: "Rossmann Drogerie",
    datum: "15.06.2026",
    gesamtbetrag: 18.90,
    kategorie: "Büro",
    kontoId: "acc_3", // Bargeld
    erstelltAm: new Date("2026-06-15T14:15:00Z").toISOString(),
    bemerkung: "Schreibblöcke und Kugelschreiber"
  },
  {
    id: "rec_3",
    userId: "user_demo",
    geschaeft: "Pizzeria Da Luigi",
    datum: "18.06.2026",
    gesamtbetrag: 78.00,
    kategorie: "Essen",
    kontoId: "acc_2", // Kreditkarte
    erstelltAm: new Date("2026-06-18T20:45:00Z").toISOString(),
    bemerkung: "Kunden-Bewirtung (Herr Müller)"
  },
  {
    id: "rec_4",
    userId: "user_demo",
    geschaeft: "Deutsche Bahn",
    datum: "22.06.2026",
    gesamtbetrag: 29.90,
    kategorie: "Fahrtkosten",
    kontoId: "acc_1", // Hauptkonto
    erstelltAm: new Date("2026-06-22T10:10:00Z").toISOString(),
    bemerkung: "Bahnticket zum Kundentermin"
  },
  {
    id: "rec_5",
    userId: "user_demo",
    geschaeft: "IKEA",
    datum: "25.06.2026",
    gesamtbetrag: 112.50,
    kategorie: "Sonstiges",
    kontoId: "acc_1", // Hauptkonto
    erstelltAm: new Date("2026-06-25T16:30:00Z").toISOString(),
    bemerkung: "Schreibtischlampe & Dekoration"
  }
];

const DB_FILE = path.join(process.cwd(), "receipts-db.json");
const ACCOUNTS_FILE = path.join(process.cwd(), "accounts-db.json");
const USERS_FILE = path.join(process.cwd(), "users-db.json");

// Default user
const DEFAULT_USERS: User[] = [
  {
    id: "user_demo",
    email: "demo@example.com",
    name: "Demo User",
    passwordHash: "demo123",
    erstelltAm: new Date().toISOString()
  }
];

// Helper to load users
function loadUsers(): User[] {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Fehler beim Laden der Benutzerdatenbank:", err);
  }
  return DEFAULT_USERS;
}

// Helper to save users
function saveUsers(users: User[]) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  } catch (err) {
    console.error("Fehler beim Speichern der Benutzerdatenbank:", err);
  }
}

// Helper to load accounts
function loadAccounts(userId?: string): Account[] {
  try {
    let accounts: Account[] = [];
    if (fs.existsSync(ACCOUNTS_FILE)) {
      const data = fs.readFileSync(ACCOUNTS_FILE, "utf-8");
      accounts = JSON.parse(data);
    } else {
      accounts = DEFAULT_ACCOUNTS;
    }

    // Migration helper: ensure everyone has a userId, default to user_demo
    let migrated = false;
    accounts = accounts.map(a => {
      if (!a.userId) {
        migrated = true;
        return { ...a, userId: "user_demo" };
      }
      return a;
    });
    if (migrated) {
      saveAccounts(accounts);
    }

    if (userId) {
      const filtered = accounts.filter(a => a.userId === userId);
      // Seed default accounts if new user has none
      if (filtered.length === 0) {
        const newDefaults: Account[] = [
          { id: "acc_1_" + userId, userId, name: "Hauptkonto (Spk)", kontotyp: "Bankkonto", startguthaben: 2500.00, farbe: "indigo", erstelltAm: new Date().toISOString() },
          { id: "acc_2_" + userId, userId, name: "Kreditkarte (Visa)", kontotyp: "Kreditkarte", startguthaben: 1000.00, farbe: "amber", erstelltAm: new Date().toISOString() },
          { id: "acc_3_" + userId, userId, name: "Portemonnaie (Bar)", kontotyp: "Bargeld", startguthaben: 150.00, farbe: "emerald", erstelltAm: new Date().toISOString() }
        ];
        accounts.push(...newDefaults);
        saveAccounts(accounts);
        return newDefaults;
      }
      return filtered;
    }
    return accounts;
  } catch (err) {
    console.error("Fehler beim Laden der Kontendatenbank:", err);
  }
  return DEFAULT_ACCOUNTS;
}

// Helper to save accounts
function saveAccounts(accounts: Account[]) {
  try {
    fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), "utf-8");
  } catch (err) {
    console.error("Fehler beim Speichern der Kontendatenbank:", err);
  }
}

// Helper to load receipts
function loadReceipts(userId?: string): Receipt[] {
  try {
    let receipts: Receipt[] = [];
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, "utf-8");
      receipts = JSON.parse(data);
    } else {
      receipts = DEFAULT_RECEIPTS;
    }

    // Migration helper: ensure all receipts have some userId and kontoId
    let migrated = false;
    receipts = receipts.map(r => {
      let changed = false;
      let newR = { ...r };
      if (!r.userId) {
        newR.userId = "user_demo";
        changed = true;
      }
      if (!r.kontoId) {
        newR.kontoId = "acc_1";
        changed = true;
      }
      if (changed) migrated = true;
      return newR;
    });
    if (migrated) {
      saveReceipts(receipts);
    }

    if (userId) {
      return receipts.filter(r => r.userId === userId);
    }
    return receipts;
  } catch (err) {
    console.error("Fehler beim Laden der Quittungsdatenbank:", err);
  }
  return DEFAULT_RECEIPTS;
}

// Helper to save receipts
function saveReceipts(receipts: Receipt[]) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(receipts, null, 2), "utf-8");
  } catch (err) {
    console.error("Fehler beim Speichern der Quittungsdatenbank:", err);
  }
}

// Initialize database with defaults if not exists
if (!fs.existsSync(DB_FILE)) {
  saveReceipts(DEFAULT_RECEIPTS);
}
if (!fs.existsSync(ACCOUNTS_FILE)) {
  saveAccounts(DEFAULT_ACCOUNTS);
}
if (!fs.existsSync(USERS_FILE)) {
  saveUsers(DEFAULT_USERS);
}

// Helper to extract userId from Auth token header
function getUserId(req: express.Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  return null;
}

// Initialize Google GenAI client lazily to avoid crashing on missing key at startup
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY-Umgebungsvariable ist nicht gesetzt. Bitte fügen Sie sie in den Einstellungen unter Secrets hinzu.");
    }
    aiClient = new GoogleGenAI({
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// ----------------------------------------------------
// API ROUTES
// ----------------------------------------------------

// ----------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

// Register a new user
app.post("/api/auth/register", (req, res) => {
  try {
    const { email, name, password } = req.body;
    if (!email || !name || !password) {
      res.status(400).json({ error: "Bitte füllen Sie alle Pflichtfelder aus (Name, E-Mail, Passwort)." });
      return;
    }
    const users = loadUsers();
    const normalizedEmail = email.toLowerCase().trim();
    if (users.some(u => u.email === normalizedEmail)) {
      res.status(400).json({ error: "Ein Benutzer mit dieser E-Mail-Adresse existiert bereits." });
      return;
    }
    const newUser: User = {
      id: "user_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      email: normalizedEmail,
      name: name.trim(),
      passwordHash: password, // simple storage for demo purposes
      erstelltAm: new Date().toISOString()
    };
    users.push(newUser);
    saveUsers(users);

    // Automatically seed accounts for this new user so they have full functional accounts instantly
    loadAccounts(newUser.id);

    res.status(201).json({
      id: newUser.id,
      email: newUser.email,
      name: newUser.name,
      token: newUser.id
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post("/api/auth/login", (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "Bitte E-Mail-Adresse und Passwort eingeben." });
      return;
    }
    const users = loadUsers();
    const normalizedEmail = email.toLowerCase().trim();
    const user = users.find(u => u.email === normalizedEmail);
    if (!user || user.passwordHash !== password) {
      res.status(401).json({ error: "Ungültige E-Mail-Adresse oder Passwort." });
      return;
    }
    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      token: user.id
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get current logged-in user profile
app.get("/api/auth/me", (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Nicht autorisiert." });
    return;
  }
  const users = loadUsers();
  const user = users.find(u => u.id === userId);
  if (!user) {
    res.status(404).json({ error: "Benutzer nicht gefunden." });
    return;
  }
  res.json({
    id: user.id,
    email: user.email,
    name: user.name
  });
});

// ----------------------------------------------------
// PAYMENT ACCOUNTS (KONTEN) ENDPOINTS
// ----------------------------------------------------

// Accounts Endpoint: Get all accounts
app.get("/api/accounts", (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Bitte melden Sie sich an." });
    return;
  }
  const accounts = loadAccounts(userId);
  res.json(accounts);
});

// Accounts Endpoint: Add a new account
app.post("/api/accounts", (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Bitte melden Sie sich an." });
      return;
    }
    const { name, kontotyp, startguthaben, farbe } = req.body;
    if (!name || !kontotyp) {
      res.status(400).json({ error: "Fehlende Pflichtfelder (name, kontotyp)" });
      return;
    }
    const accounts = loadAccounts();
    const newAccount: Account = {
      id: "acc_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      userId,
      name,
      kontotyp,
      startguthaben: Number(startguthaben) || 0,
      farbe: farbe || "indigo",
      erstelltAm: new Date().toISOString()
    };
    accounts.push(newAccount);
    saveAccounts(accounts);
    res.status(201).json(newAccount);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Accounts Endpoint: Delete an account
app.delete("/api/accounts/:id", (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Bitte melden Sie sich an." });
      return;
    }
    const { id } = req.params;
    let accounts = loadAccounts();
    const account = accounts.find(a => a.id === id);
    if (!account) {
      res.status(404).json({ error: "Konto nicht gefunden" });
      return;
    }
    // Check ownership
    if (account.userId !== userId) {
      res.status(403).json({ error: "Keine Berechtigung für dieses Konto." });
      return;
    }
    
    const userAccounts = accounts.filter(a => a.userId === userId);
    if (userAccounts.length <= 1) {
      res.status(400).json({ error: "Ihr einziges verbleibendes Konto kann nicht gelöscht werden." });
      return;
    }
    
    // Find fallback account for this user (the first one that's not this one)
    const fallbackAcc = userAccounts.find(a => a.id !== id);
    const fallbackId = fallbackAcc ? fallbackAcc.id : "acc_1";

    accounts = accounts.filter(a => a.id !== id);
    saveAccounts(accounts);

    // Update any receipts that were linked to this account to user's fallback account
    let receipts = loadReceipts();
    let updated = false;
    receipts = receipts.map(r => {
      if (r.userId === userId && r.kontoId === id) {
        updated = true;
        return { ...r, kontoId: fallbackId };
      }
      return r;
    });
    if (updated) {
      saveReceipts(receipts);
    }

    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Get all receipts
app.get("/api/receipts", (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Bitte melden Sie sich an." });
    return;
  }
  const receipts = loadReceipts(userId);
  res.json(receipts);
});

// Add a receipt manually or after scanning
app.post("/api/receipts", (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Bitte melden Sie sich an." });
      return;
    }
    const { geschaeft, datum, gesamtbetrag, kategorie, image, bemerkung, kontoId } = req.body;
    
    if (!geschaeft || !datum || gesamtbetrag === undefined || !kategorie) {
      res.status(400).json({ error: "Fehlende Pflichtfelder (geschaeft, datum, gesamtbetrag, kategorie)" });
      return;
    }

    const receipts = loadReceipts();
    const newReceipt: Receipt = {
      id: "rec_" + Date.now() + "_" + Math.random().toString(36).substr(2, 4),
      userId,
      geschaeft,
      datum,
      gesamtbetrag: Number(gesamtbetrag),
      kategorie,
      image,
      bemerkung,
      kontoId: kontoId || "acc_1",
      erstelltAm: new Date().toISOString()
    };

    receipts.unshift(newReceipt);
    saveReceipts(receipts);
    res.status(201).json(newReceipt);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Delete a receipt
app.delete("/api/receipts/:id", (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Bitte melden Sie sich an." });
      return;
    }
    const { id } = req.params;
    let receipts = loadReceipts();
    const receipt = receipts.find(r => r.id === id);
    if (!receipt) {
      res.status(404).json({ error: "Beleg nicht gefunden" });
      return;
    }
    if (receipt.userId !== userId) {
      res.status(403).json({ error: "Keine Berechtigung für diesen Beleg." });
      return;
    }
    receipts = receipts.filter(r => r.id !== id);
    saveReceipts(receipts);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Process image using Gemini
app.post("/api/process-receipt", async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Bitte melden Sie sich an." });
      return;
    }
    const { imageBase64, mimeType } = req.body;
    if (!imageBase64) {
      res.status(400).json({ error: "Fehlende Bilddaten im Base64-Format" });
      return;
    }

    // Clean base64 image data if prefix is sent
    let cleanedBase64 = imageBase64;
    let detectedMimeType = mimeType || "image/jpeg";

    if (imageBase64.includes(";base64,")) {
      const parts = imageBase64.split(";base64,");
      cleanedBase64 = parts[1];
      const match = parts[0].match(/data:(image\/\w+)/);
      if (match) {
        detectedMimeType = match[1];
      }
    }

    const ai = getGenAI();

    const imagePart = {
      inlineData: {
        mimeType: detectedMimeType,
        data: cleanedBase64,
      },
    };

    const promptText = `Lies diesen Beleg genau aus. Gib mir das Datum im Format TT.MM.JJJJ, den Gesamtbetrag in Euro und den Namen des Geschäfts. Sortiere den Beleg danach in eine dieser Kategorien ein: Fahrtkosten, Büro, Essen oder Sonstiges. Bestimme außerdem die Zahlungsart als einen der folgenden Werte: 'Bar', 'Kreditkarte', 'Bankkonto' (falls EC-Karte, Girocard, Lastschrift oder Überweisung) oder 'Unbekannt'. Antworte nur im JSON-Format.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts: [imagePart, { text: promptText }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            geschaeft: {
              type: Type.STRING,
              description: "Der Name des Ladens, Geschäfts oder Dienstleisters (z.B. 'Aral', 'Rossmann', 'Rewe')"
            },
            datum: {
              type: Type.STRING,
              description: "Das Kauf- oder Belegdatum im Format TT.MM.JJJJ"
            },
            gesamtbetrag: {
              type: Type.NUMBER,
              description: "Der Gesamtbetrag in Euro als Dezimalzahl (z.B. 45.00)"
            },
            kategorie: {
              type: Type.STRING,
              description: "Die am besten passende Kategorie aus: 'Fahrtkosten', 'Büro', 'Essen' oder 'Sonstiges'"
            },
            bemerkung: {
              type: Type.STRING,
              description: "Eine kurze deutsche Zusammenfassung des Einkaufs (z.B. 'Tanken', 'Büroartikel')"
            },
            zahlungsart: {
              type: Type.STRING,
              description: "Die Zahlungsart auf dem Beleg. Muss einer dieser Werte sein: 'Bar', 'Kreditkarte', 'Bankkonto', 'Unbekannt'."
            }
          },
          required: ["geschaeft", "datum", "gesamtbetrag", "kategorie", "zahlungsart"]
        }
      }
    });

    const resultText = response.text;
    if (!resultText) {
      throw new Error("Gemini lieferte eine leere Antwort.");
    }

    const parsedResult = JSON.parse(resultText.trim());
    
    // Map detected payment method to an actual user account
    const accounts = loadAccounts(userId);
    let matchedKontoId = accounts[0]?.id || "acc_1"; // Default fallback Hauptkonto
    
    if (parsedResult.zahlungsart === "Bar") {
      const acc = accounts.find(a => a.kontotyp === "Bargeld");
      if (acc) matchedKontoId = acc.id;
    } else if (parsedResult.zahlungsart === "Kreditkarte") {
      const acc = accounts.find(a => a.kontotyp === "Kreditkarte");
      if (acc) matchedKontoId = acc.id;
    } else if (parsedResult.zahlungsart === "Bankkonto") {
      const acc = accounts.find(a => a.kontotyp === "Bankkonto");
      if (acc) matchedKontoId = acc.id;
    }
    
    parsedResult.kontoId = matchedKontoId;
    res.json(parsedResult);
  } catch (error: any) {
    console.error("Fehler bei der Beleganalyse mit Gemini:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reset database route (optional, useful utility)
app.post("/api/reset", (req, res) => {
  saveReceipts(DEFAULT_RECEIPTS);
  res.json({ success: true, receipts: DEFAULT_RECEIPTS });
});

// ----------------------------------------------------
// VITE OR STATIC FILES SERVING
// ----------------------------------------------------
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server läuft auf http://localhost:${PORT}`);
  });
}

start();
