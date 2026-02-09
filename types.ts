// types.ts

export interface ComputoItem {
  id: number;
  codice_articolo: string;
  descrizione: string;
  um: string;
  quantita: number;
  prezzo_unitario: number;
  importo: number;
}

export interface CertificationMetadata {
  uuid: string;
  readableId: string;
  hash: string; // SHA-256 of the generated file content blob
  timestamp: string; // ISO-8601 format
  generatorVersion: string;
  parentId?: string; // For versioning
}

// Represents a source found by Google Search grounding
export interface GroundingChunk {
  web: {
    uri: string;
    title: string;
  };
}

export interface GenerationResult {
  computoItems: ComputoItem[];
  generatedImage?: string; // Base64 encoded image
  reportText: string;
  metadata?: CertificationMetadata;
  pdfBlob?: Blob; // The locally generated PDF blob for immediate download (optional for archived projects)
  sources?: GroundingChunk[];
  // URLs for files stored in Firebase Storage
  pdfDownloadUrl?: string;
  originalImageUrl?: string;
  generatedImageUrl?: string;
}


// Represents an interactive project creation session. Stored in 'projectSessions' collection.
export interface ProjectSession {
    id: string; // document ID in firestore
    userId: string;
    projectName: string;
    createdAt: any; // serverTimestamp
    updatedAt: any; // serverTimestamp
    status: 'open' | 'paused' | 'closed';
    projectType?: 'public_works' | 'private_estimate'; // Type of project
    region?: string; // Italian region for public works price lists
    preferredStores?: string[]; // Store names for private estimates (e.g., ["Leroy Merlin", "Bricoman"])
    context: {
        descriptionItems: string[];
        location: string;
        committente: {
            nome: string;
            cognome: string;
            codiceFiscale: string;
            indirizzo: string;
        };
    };
    parentId?: string; // ID of the original project if this is a duplicate/edit
    generatedProjectId?: string; // Links to the final certified project
}