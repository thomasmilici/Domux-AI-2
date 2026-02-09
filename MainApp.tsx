import React, { useState, useRef, ChangeEvent, useEffect } from 'react';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateComputoMetric, generateRenovationPlan } from './services/geminiService';
import { GenerationResult, ProjectSession, CertificationMetadata, ComputoItem } from './types';
import { db, User, addDoc, collection, serverTimestamp, doc, updateDoc, getDocs, onSnapshot, storage, ref, uploadBytes, getDownloadURL, uploadString, query, where } from './services/firebase';
import Logger from './services/logger';
import Loader from './components/Loader';
import ErrorMessage from './components/ErrorMessage';
import RenovationReport from './components/RenovationReport';
import VoiceAssistant from './components/VoiceAssistant';
import ComputoEditor from './components/ComputoEditor';
import { LOGO_JPEG_DATA_URL } from './assets/logo-jpeg';
import { generateProfessionalPDF } from './utils/pdfGeneration';


interface MainAppProps {
  user: User;
  onGoBack: () => void;
  initialSessionId: string; 
}

// Helper to calculate SHA256 hash of a blob
async function calculateSHA256(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}

// FIX: Added a trailing comma to the generic type parameter `<T,>` to disambiguate from JSX syntax.
const withTimeout = <T,>(
  promise: Promise<T>, 
  ms: number, 
  timeoutError = new Error('L\'operazione ha richiesto troppo tempo.')
): Promise<T> => {
  const timeout = new Promise<T>((_, reject) => {
    const id = setTimeout(() => {
      clearTimeout(id);
      reject(timeoutError);
    }, ms);
  });
  return Promise.race([promise, timeout]);
};


// This function will now throw on any error, letting the caller handle it.
const uploadAndSaveFiles = async (
    generatedResult: Pick<GenerationResult, 'computoItems' | 'generatedImage' | 'reportText' | 'sources'>,
    pdfBlob: Blob,
    metadata: CertificationMetadata,
    fullDescription: string,
    session: ProjectSession,
    user: User,
    imageFile: File | null,
    setLoadingMessage: (message: string) => void
): Promise<Pick<GenerationResult, 'pdfDownloadUrl' | 'originalImageUrl' | 'generatedImageUrl'>> => {
    const UPLOAD_TIMEOUT = 300000; // 5 minutes (increased from 3)
    const storagePath = `projects/${user.uid}/${session.id}`;
    let finalPdfUrl = '', finalOriginalImageUrl, finalGeneratedImageUrl;

    try {
        Logger.log("Starting file uploads and database save...");

        setLoadingMessage("Caricamento del PDF certificato...");
        Logger.log("Uploading PDF...");
        // Create sanitized filename from project name (remove special characters, keep spaces)
        const sanitizedProjectName = (session.projectName || 'computo')
            .replace(/[^\w\s-]/g, '') // Remove special chars except spaces and hyphens
            .replace(/\s+/g, '_') // Replace spaces with underscores
            .substring(0, 100); // Limit length
        const pdfFileName = `${sanitizedProjectName}_${metadata.readableId}.pdf`;
        const pdfRef = ref(storage, `${storagePath}/${pdfFileName}`);
        await withTimeout(uploadBytes(pdfRef, pdfBlob), UPLOAD_TIMEOUT);
        finalPdfUrl = await getDownloadURL(pdfRef);
        Logger.log("PDF upload successful.", { url: finalPdfUrl });

        if (imageFile) {
            setLoadingMessage("Caricamento dell'immagine originale...");
            Logger.log("Uploading original image...");
            const originalImageRef = ref(storage, `${storagePath}/original_${Date.now()}`);
            await withTimeout(uploadBytes(originalImageRef, imageFile), UPLOAD_TIMEOUT);
            finalOriginalImageUrl = await getDownloadURL(originalImageRef);
            Logger.log("Original image upload successful.", { url: finalOriginalImageUrl });
        }

        if (generatedResult.generatedImage) {
            setLoadingMessage("Caricamento dell'immagine generata...");
            Logger.log("Uploading generated image...");
            const generatedImageRef = ref(storage, `${storagePath}/generated_${Date.now()}.jpeg`);
            await withTimeout(uploadString(generatedImageRef, generatedResult.generatedImage, 'base64'), UPLOAD_TIMEOUT);
            finalGeneratedImageUrl = await getDownloadURL(generatedImageRef);
            Logger.log("Generated image upload successful.", { url: finalGeneratedImageUrl });
        }
        
        setLoadingMessage("Finalizzazione e salvataggio dei dati del progetto...");
        Logger.log("Adding project document to Firestore...");

        // Prepare project data without undefined fields
        const projectData: any = {
            userId: user.uid,
            createdAt: serverTimestamp(),
            userInput: fullDescription,
            projectName: session.projectName, // Save project title for use in download filenames
            location: session.context.location,
            committente: session.context.committente,
            isRenovation: !!imageFile,
            result: {
                computoItems: generatedResult.computoItems,
                reportText: generatedResult.reportText,
                sources: generatedResult.sources || []
            },
            pdfDownloadUrl: finalPdfUrl,
            metadata: metadata
        };

        // Only add image URLs if they exist
        if (finalOriginalImageUrl) {
            projectData.originalImageUrl = finalOriginalImageUrl;
        }
        if (finalGeneratedImageUrl) {
            projectData.generatedImageUrl = finalGeneratedImageUrl;
        }

        const projectDocRef = await addDoc(collection(db, 'projects'), projectData);
        Logger.log("Project document added successfully.", { id: projectDocRef.id });
        
        Logger.log(`Updating session ${session.id} to status 'closed'.`);
        await updateDoc(doc(db, 'projectSessions', session.id), {
            status: 'closed',
            generatedProjectId: projectDocRef.id,
            updatedAt: serverTimestamp(),
        });
        Logger.log("Session status updated successfully.");
        
        Logger.log("Project save process completed successfully.");
        return { pdfDownloadUrl: finalPdfUrl, originalImageUrl: finalOriginalImageUrl, generatedImageUrl: finalGeneratedImageUrl };

    } catch (error) {
        Logger.error("Error during uploadAndSaveFiles:", error);
        // Rethrow the error to be caught by the caller
        throw error;
    }
};

// FIX: Rewriting component definition and state hooks to ensure correct syntax and resolve parsing errors.
const MainApp: React.FC<MainAppProps> = ({ user, onGoBack, initialSessionId }) => {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [image, setImage] = useState<{ file: File, base64: string, mimeType: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [isVoiceAssistantOpen, setIsVoiceAssistantOpen] = useState<boolean>(false);
  const [currentDescription, setCurrentDescription] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  // Pre-export editing states
  const [isEditingComputo, setIsEditingComputo] = useState<boolean>(false);
  const [generatedData, setGeneratedData] = useState<{
    computoItems: ComputoItem[];
    reportText: string;
    generatedImage?: string;
    sources: any[];
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Imposta userId e sessionId nel logger per tracciamento
    Logger.setUserId(user?.uid || null);
    Logger.setSessionId(initialSessionId);

    let unsubscribe: () => void = () => {};

    if (!initialSessionId) {
        setError("ID sessione non fornito.");
        Logger.error("MainApp: initialSessionId is missing.");
        setLoading(false);
        return;
    }

    Logger.log(`MainApp: Setting up listener for session ID: ${initialSessionId}`);
    const sessionDocRef = doc(db, 'projectSessions', initialSessionId);
    unsubscribe = onSnapshot(sessionDocRef, (docSnap) => {
        if (docSnap.exists()) {
            setSession({ id: docSnap.id, ...docSnap.data() } as ProjectSession);
        } else {
            setError("Sessione non trovata.");
            Logger.warn(`Session with ID ${initialSessionId} not found in Firestore.`);
        }
        setLoading(false);
    }, (err) => {
        console.error("Error listening to session:", err);
        setError("Errore nel caricamento della sessione.");
        Logger.error("Error listening to session snapshot", err);
        setLoading(false);
    });

    return () => {
        Logger.log(`MainApp: Cleaning up listener for session ID: ${initialSessionId}`);
        unsubscribe();
    };
  }, [initialSessionId]);

  
  const updateSessionContext = async (updates: Partial<ProjectSession['context']>) => {
    if (!session) return;
    const sessionDocRef = doc(db, 'projectSessions', session.id);

    const firestoreUpdates: { [key: string]: any } = {};
    for (const key in updates) {
        firestoreUpdates[`context.${key}`] = (updates as any)[key];
    }
    firestoreUpdates.updatedAt = serverTimestamp();

    await updateDoc(sessionDocRef, firestoreUpdates);
  };

  const updateSession = async (updates: Partial<Omit<ProjectSession, 'id' | 'userId' | 'context'>>) => {
    if (!session) return;
    const sessionDocRef = doc(db, 'projectSessions', session.id);

    const firestoreUpdates: { [key: string]: any } = {
      ...updates,
      updatedAt: serverTimestamp()
    };

    await updateDoc(sessionDocRef, firestoreUpdates);
  };
  
  const handleCommittenteChange = (e: ChangeEvent<HTMLInputElement>) => {
      const { name, value } = e.target;
      if (session) {
        const updatedCommittente = { ...(session.context.committente || {}), [name]: value };
        updateSessionContext({ committente: updatedCommittente });
      }
  };


  const handleAddDescription = () => {
    if (!currentDescription.trim() || !session) return;
    const newItems = [...session.context.descriptionItems, currentDescription.trim()];
    updateSessionContext({ descriptionItems: newItems });
    setCurrentDescription('');
  };

  const handleRemoveDescription = (index: number) => {
    if (!session) return;
    const newItems = session.context.descriptionItems.filter((_, i) => i !== index);
    updateSessionContext({ descriptionItems: newItems });
  };

  const handleEditDescription = (index: number, newText: string) => {
    if (!session) return;
    const newItems = [...session.context.descriptionItems];
    newItems[index] = newText;
    updateSessionContext({ descriptionItems: newItems });
  };

  // Handler for editing already generated/finalized projects
  const handleEditResult = async (editedItems: ComputoItem[], editedReport: string) => {
    if (!session || !result) return;

    setLoading(true);
    setError(null);

    try {
      setLoadingMessage('Rigenerazione PDF con le modifiche...');

      // Generate metadata for PDF
      const updatedMetadata = {
        ...result.metadata!,
        timestamp: new Date().toISOString(), // Update timestamp for modified version
      };

      // Use new professional PDF generation function
      const tempDoc = generateProfessionalPDF(
        editedItems,
        editedReport,
        user,
        session,
        updatedMetadata,
        result.originalImageUrl,
        result.generatedImageUrl
      );

      // Calculate new hash for modified content
      const contentBlob = tempDoc.output('blob');
      const hash = await calculateSHA256(contentBlob);
      updatedMetadata.hash = hash;

      // Update result state with edited data and new PDF
      setResult({
        ...result,
        computoItems: editedItems,
        reportText: editedReport,
        metadata: updatedMetadata,
        pdfBlob: contentBlob,
      });

      setLoading(false);
      setLoadingMessage('');
      alert('✅ Modifiche applicate con successo! Scarica il nuovo PDF per salvare le modifiche.');

    } catch (err: any) {
      Logger.error("Error in handleEditResult", err);
      setError(`Errore durante l'applicazione delle modifiche: ${err.message}`);
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const compressImage = async (file: File): Promise<{ file: File, base64: string, mimeType: string }> => {
    return new Promise((resolve, reject) => {
      Logger.log(`[COMPRESS] Starting compression for file: ${file.name}, size: ${file.size} bytes`);

      const reader = new FileReader();

      reader.onload = (e) => {
        Logger.log(`[COMPRESS] File read successfully, creating Image element`);
        const img = new Image();

        img.onload = () => {
          Logger.log(`[COMPRESS] Image loaded successfully, dimensions: ${img.width}x${img.height}`);

          // Set maximum dimensions (good balance between quality and size)
          const MAX_WIDTH = 1920;
          const MAX_HEIGHT = 1920;

          let width = img.width;
          let height = img.height;

          // Calculate new dimensions maintaining aspect ratio
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          Logger.log(`[COMPRESS] Target dimensions: ${width}x${height}`);

          // Create canvas and compress
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            Logger.error('[COMPRESS] Failed to get canvas context');
            reject(new Error('Impossibile creare il contesto canvas'));
            return;
          }

          Logger.log(`[COMPRESS] Drawing image to canvas...`);
          // Draw and compress image
          ctx.drawImage(img, 0, 0, width, height);

          Logger.log(`[COMPRESS] Converting to JPEG blob...`);
          // Convert to JPEG with 85% quality (good balance)
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                Logger.error('[COMPRESS] toBlob returned null');
                reject(new Error('Impossibile comprimere l\'immagine'));
                return;
              }

              Logger.log(`[COMPRESS] Blob created, size: ${blob.size} bytes, converting to base64...`);

              // Convert blob to base64
              const compressedReader = new FileReader();
              compressedReader.onloadend = () => {
                const base64String = (compressedReader.result as string).split(',')[1];

                // Create new File object from blob
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });

                Logger.log(`[COMPRESS] ✅ Compression complete: ${file.size} bytes -> ${blob.size} bytes (${Math.round((blob.size / file.size) * 100)}%)`);

                resolve({
                  file: compressedFile,
                  base64: base64String,
                  mimeType: 'image/jpeg'
                });
              };
              compressedReader.onerror = (err) => {
                Logger.error('[COMPRESS] Error reading compressed image', err);
                reject(new Error('Errore nella lettura dell\'immagine compressa'));
              };
              compressedReader.readAsDataURL(blob);
            },
            'image/jpeg',
            0.85 // 85% quality
          );
        };

        img.onerror = (err) => {
          Logger.error('[COMPRESS] Error loading image into Image element', err);
          reject(new Error('Errore nel caricamento dell\'immagine'));
        };

        img.src = e.target?.result as string;
      };

      reader.onerror = (err) => {
        Logger.error('[COMPRESS] Error reading file', err);
        reject(new Error('Errore nella lettura del file'));
      };

      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      try {
        // Check file size before processing (max 20MB)
        const maxSize = 20 * 1024 * 1024; // 20MB
        if (file.size > maxSize) {
          setError(`L'immagine è troppo grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Massimo 20MB. Prova a ridurre la qualità dalla fotocamera del tuo smartphone.`);
          return;
        }

        setLoading(true);
        setLoadingMessage('Compressione immagine in corso...');

        // Compress image before storing
        const compressed = await compressImage(file);
        setImage(compressed);
        setResult(null);

        setLoading(false);
        setLoadingMessage('');
        Logger.log(`Image loaded and compressed successfully. Original: ${file.size} bytes`);
      } catch (error: any) {
        Logger.error('Error compressing image', error);
        setError(`Errore durante la compressione dell'immagine: ${error.message}. Prova con un'immagine più piccola.`);
        setLoading(false);
        setLoadingMessage('');
      }
    }
  };

  const handleGenerateProject = async () => {
    Logger.log('[GENERATE] Starting project generation...');

    if (!session || !session.context.location) {
      setError('Per favore, specifica la località dei lavori.');
      return;
    }
    const fullDescription = session.context.descriptionItems.join('; ');
    if (!fullDescription) {
        setError('Per favore, aggiungi almeno una descrizione dei lavori.');
        return;
    }

    Logger.log(`[GENERATE] Project type: ${session.projectType}, Has image: ${!!image}`);

    setError(null);
    setLoading(true);
    setResult(null);

    try {
        // Set loading message based on project type
        let initialLoadingMessage = 'Analisi della richiesta in corso...';
        if (session.projectType === 'public_works') {
            const regionName = session.region || session.context.location;
            initialLoadingMessage = `Ricerca prezzari regionali ufficiali per ${regionName}...`;
        } else if (session.projectType === 'private_estimate') {
            const stores = session.preferredStores && session.preferredStores.length > 0
                ? session.preferredStores.join(', ')
                : 'principali store di edilizia';
            initialLoadingMessage = `Ricerca prezzi e codici prodotto negli store: ${stores}...`;
        }
        setLoadingMessage(initialLoadingMessage);

        // Add a slight delay to ensure loading message is visible
        await new Promise(resolve => setTimeout(resolve, 100));

        Logger.log(`[GENERATE] Calling AI API... (with image: ${!!image})`);

        const generationResult = image
            ? await generateRenovationPlan(
                fullDescription,
                session.context.location,
                image.base64,
                image.mimeType,
                session.projectType,
                session.region,
                session.preferredStores
              )
            : await generateComputoMetric(
                fullDescription,
                session.context.location,
                session.projectType,
                session.region,
                session.preferredStores
              );

        Logger.log('[GENERATE] ✅ AI API call successful, showing editor...');

        // Instead of generating PDF immediately, show editor
        setGeneratedData(generationResult);
        setIsEditingComputo(true);
        setLoading(false);
        setLoadingMessage('');

    } catch (err: any) {
        const errorMessage = err.message || 'Si è verificato un errore inaspettato durante la generazione.';
        Logger.error("Error in handleGenerateProject", err);

        setError(`Generazione fallita: ${errorMessage}`);
        setLoading(false);
        setLoadingMessage('');
    }
  };

  const handleFinalizeProject = async (editedItems: ComputoItem[], editedReport: string) => {
    if (!session) return;

    setIsEditingComputo(false);
    setLoading(true);
    setError(null);
    setResult(null);

    try {
        setLoadingMessage('Generazione completata. Creazione del documento PDF certificato...');

        // Validate that customer surname is present (mandatory)
        const cognomeCommittente = session.context.committente?.cognome?.trim();
        if (!cognomeCommittente) {
            throw new Error('Il cognome del committente è obbligatorio. Per favore, completa i dati del committente prima di generare il computo.');
        }

        // Generate intelligent project title based on computo items
        setLoadingMessage('Generazione del titolo intelligente del progetto...');
        const { generateProjectTitle } = await import('./services/geminiService');
        const projectDescription = await generateProjectTitle(
            editedItems,
            session.context.descriptionItems.join('; ')
        );

        // Create formatted project title: "[Descrizione] Sig. [Cognome] - [Data]"
        const formattedDate = new Date().toLocaleDateString('it-IT');
        let suggestedTitle = `${projectDescription} Sig. ${cognomeCommittente} - ${formattedDate}`;

        // Allow user to modify the title
        setLoading(false);
        const userTitle = prompt(
            'Conferma o modifica il titolo del progetto:\n\n(Il titolo verrà usato nel PDF e nel nome del file)',
            suggestedTitle
        );
        setLoading(true);

        // If user cancelled, abort
        if (userTitle === null) {
            setLoading(false);
            setLoadingMessage('');
            return;
        }

        // Use user's title (or keep suggested if they didn't change it)
        const newProjectName = userTitle.trim() || suggestedTitle;

        // Update session with new project name
        const sessionDocRef = doc(db, 'projectSessions', session.id);
        await updateDoc(sessionDocRef, {
            projectName: newProjectName,
            updatedAt: serverTimestamp()
        });

        // Update local session object
        session.projectName = newProjectName;

        // Generate a robust, query-free readable ID
        const datePart = new Date().toISOString().split('T')[0];
        const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
        const readableId = `CM-${datePart}-${randomPart}`;

        // Create metadata for certification
        const metadata: any = {
            uuid: crypto.randomUUID(),
            readableId,
            hash: '', // Will be calculated after PDF generation
            timestamp: new Date().toISOString(),
            generatorVersion: "Domux AI v1.5",
        };

        // Only add parentId if it exists (Firestore doesn't allow undefined)
        if (session.parentId) {
            metadata.parentId = session.parentId;
        }

        setLoadingMessage('Creazione del documento PDF certificato...');

        // Prepare image URLs for PDF (convert to data URLs if available)
        const originalImageDataUrl = image ? URL.createObjectURL(image.file) : undefined;
        const generatedImageDataUrl = generatedData?.generatedImage
            ? `data:image/jpeg;base64,${generatedData.generatedImage}`
            : undefined;

        // Use professional PDF generation function with updated session
        const tempDoc = generateProfessionalPDF(
            editedItems,
            editedReport,
            user,
            session,
            metadata,
            originalImageDataUrl,
            generatedImageDataUrl
        );

        // Calculate hash of the generated PDF
        const contentBlob = tempDoc.output('blob');
        const hash = await calculateSHA256(contentBlob);
        metadata.hash = hash;

        const fullDescription = session.context.descriptionItems.join('; ');

        // Reconstruct generationResult with edited data
        const finalResult = {
            computoItems: editedItems,
            reportText: editedReport,
            generatedImage: generatedData?.generatedImage,
            sources: generatedData?.sources || []
        };

        const storedFileUrls = await uploadAndSaveFiles(
            finalResult,
            contentBlob,
            metadata,
            fullDescription,
            session,
            user,
            image ? image.file : null,
            setLoadingMessage
        );

        // --- SHOW RESULTS TO USER ---
        setResult({
            ...finalResult,
            metadata,
            pdfBlob: contentBlob,
            generatedImageUrl: finalResult.generatedImage ? `data:image/jpeg;base64,${finalResult.generatedImage}` : undefined,
            originalImageUrl: image ? URL.createObjectURL(image.file) : undefined,
            ...storedFileUrls
        });

    } catch (err: any) {
        const errorMessage = err.message || 'Si è verificato un errore inaspettato durante il salvataggio.';
        Logger.error("Error in handleFinalizeProject", err);

        setError(`Salvataggio fallito: ${errorMessage}. La sessione è stata messa in pausa, puoi riprovare dalla dashboard.`);

        if (session) {
            // Non-blocking attempt to update the session. If it fails, we log it but don't hang the UI.
            const sessionDocRef = doc(db, 'projectSessions', session.id);
            updateDoc(sessionDocRef, {
                status: 'paused',
                updatedAt: serverTimestamp(),
                errorLog: `Salvataggio fallito: ${errorMessage}`
            }).catch(pauseError => {
                Logger.error("CRITICAL: Failed to update session status to 'paused' after a save error.", pauseError);
            });
        }
    } finally {
        setLoading(false);
        setLoadingMessage('');
    }
  };
  
  if (loading) {
     return <Loader message={loadingMessage || "Caricamento sessione..."} />;
  }
  
  if (!session) {
      return <div className="p-8 text-center"><ErrorMessage message={error || "Impossibile caricare la sessione di lavoro."} /></div>;
  }
  
  if (result) {
    return (
        <div className="w-full">
            <RenovationReport
                user={user}
                result={result}
                userInput={session?.context.descriptionItems.join('; ') || ''}
                projectName={session?.projectName}
                location={session?.context.location || ''}
                committente={session?.context.committente}
                onEdit={handleEditResult}
                showBackButton={true}
                onGoBack={onGoBack}
            />
            <div className="text-center mt-8">
                <button onClick={onGoBack} className="bg-brand-cyan text-white font-bold py-3 px-6 rounded-lg hover:opacity-90 transition-colors duration-300 text-lg">
                    Torna alla Dashboard
                </button>
            </div>
        </div>
    );
  }

  // Show ComputoEditor if editing
  if (isEditingComputo && generatedData) {
    return (
      <ComputoEditor
        computoItems={generatedData.computoItems}
        reportText={generatedData.reportText}
        onSave={handleFinalizeProject}
        onCancel={() => {
          setIsEditingComputo(false);
          setGeneratedData(null);
        }}
      />
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto">

      {loading && <Loader message={loadingMessage} />}

      {!result && !loading && session && (
        <div className="bg-white p-8 rounded-xl shadow-lg animate-fade-in space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold text-zinc-800">Sessione Progetto</h2>
                    <p className="text-zinc-600">Aggiungi i dettagli del tuo progetto. Quando hai finito, genera il computo.</p>
                </div>
                <button
                    onClick={onGoBack}
                    className="bg-zinc-200 text-zinc-800 font-bold py-2 px-4 rounded-lg hover:bg-zinc-300 transition-colors"
                >
                    ← Indietro
                </button>
            </div>

            {/* Project Type Selection */}
            <div className="p-4 bg-gradient-to-r from-brand-dark to-brand-cyan text-white rounded-lg border-2 border-brand-dark">
                <h3 className="font-bold text-lg mb-4">🎯 Tipo di Progetto</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                        onClick={() => updateSession({ projectType: 'public_works' })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                            session.projectType === 'public_works'
                                ? 'bg-white text-brand-dark border-white font-bold'
                                : 'bg-white/10 border-white/30 hover:bg-white/20'
                        }`}
                    >
                        <div className="text-2xl mb-2">🏛️</div>
                        <div className="font-bold">Opere Pubbliche</div>
                        <div className="text-xs mt-1 opacity-90">Prezzari regionali ufficiali</div>
                    </button>
                    <button
                        onClick={() => updateSession({ projectType: 'private_estimate' })}
                        className={`p-4 rounded-lg border-2 transition-all ${
                            session.projectType === 'private_estimate'
                                ? 'bg-white text-brand-dark border-white font-bold'
                                : 'bg-white/10 border-white/30 hover:bg-white/20'
                        }`}
                    >
                        <div className="text-2xl mb-2">🏠</div>
                        <div className="font-bold">Preventivi Privati</div>
                        <div className="text-xs mt-1 opacity-90">Prezzi da store edilizia</div>
                    </button>
                </div>

                {/* Region Selection for Public Works */}
                {session.projectType === 'public_works' && (
                    <div className="mt-4">
                        <label className="block text-sm font-semibold mb-2">📍 Seleziona Regione</label>
                        <select
                            value={session.region || ''}
                            onChange={(e) => updateSession({ region: e.target.value })}
                            className="w-full p-3 rounded-lg text-zinc-800 font-semibold"
                        >
                            <option value="">Seleziona una regione...</option>
                            <option value="Abruzzo">Abruzzo</option>
                            <option value="Basilicata">Basilicata</option>
                            <option value="Calabria">Calabria</option>
                            <option value="Campania">Campania</option>
                            <option value="Emilia-Romagna">Emilia-Romagna</option>
                            <option value="Friuli-Venezia Giulia">Friuli-Venezia Giulia</option>
                            <option value="Lazio">Lazio</option>
                            <option value="Liguria">Liguria</option>
                            <option value="Lombardia">Lombardia</option>
                            <option value="Marche">Marche</option>
                            <option value="Molise">Molise</option>
                            <option value="Piemonte">Piemonte</option>
                            <option value="Puglia">Puglia</option>
                            <option value="Sardegna">Sardegna</option>
                            <option value="Sicilia">Sicilia</option>
                            <option value="Toscana">Toscana</option>
                            <option value="Trentino-Alto Adige">Trentino-Alto Adige</option>
                            <option value="Umbria">Umbria</option>
                            <option value="Valle d'Aosta">Valle d'Aosta</option>
                            <option value="Veneto">Veneto</option>
                        </select>
                    </div>
                )}

                {/* Store Selection for Private Estimates */}
                {session.projectType === 'private_estimate' && (
                    <div className="mt-4">
                        <label className="block text-sm font-semibold mb-2">🏪 Store Preferiti (opzionale)</label>
                        <p className="text-xs opacity-90 mb-3">Seleziona gli store dove acquisterai i materiali. L'AI cercherà prezzi e codici prodotto specifici.</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {['Leroy Merlin', 'Bricoman', 'OBI', 'Bricofer', 'Brico IO', 'Castorama'].map(store => (
                                <button
                                    key={store}
                                    onClick={() => {
                                        const stores = session.preferredStores || [];
                                        const updated = stores.includes(store)
                                            ? stores.filter(s => s !== store)
                                            : [...stores, store];
                                        updateSession({ preferredStores: updated });
                                    }}
                                    className={`p-2 rounded text-sm font-semibold transition-all ${
                                        (session.preferredStores || []).includes(store)
                                            ? 'bg-white text-brand-dark'
                                            : 'bg-white/20 hover:bg-white/30'
                                    }`}
                                >
                                    {(session.preferredStores || []).includes(store) ? '✓ ' : ''}{store}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <div className="p-4 bg-zinc-50 rounded-lg border">
                <h3 className="font-bold text-zinc-700 mb-4">Dati del Committente</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input type="text" name="nome" placeholder="Nome" value={session.context.committente?.nome || ''} onChange={handleCommittenteChange} className="w-full p-2 border rounded" />
                    <input type="text" name="cognome" placeholder="Cognome" value={session.context.committente?.cognome || ''} onChange={handleCommittenteChange} className="w-full p-2 border rounded" />
                    <input type="text" name="codiceFiscale" placeholder="Codice Fiscale / P.IVA" value={session.context.committente?.codiceFiscale || ''} onChange={handleCommittenteChange} className="w-full p-2 border rounded" />
                    <input type="text" name="indirizzo" placeholder="Indirizzo" value={session.context.committente?.indirizzo || ''} onChange={handleCommittenteChange} className="w-full p-2 border rounded" />
                </div>
            </div>

            <div className="p-4 bg-zinc-50 rounded-lg border">
                <h3 className="font-bold text-zinc-700 mb-2">Descrizione dei Lavori</h3>
                <p className="text-sm text-zinc-500 mb-4">Aggiungi una lavorazione alla volta (es. "Demolizione muro soggiorno", "Posa parquet rovere"). Puoi anche usare l'assistente vocale.</p>
                <ul className="space-y-2 mb-4">
                    {session.context.descriptionItems.map((item, index) => (
                        <li key={index} className="bg-white p-2 border rounded text-zinc-800 flex items-center justify-between gap-2">
                            {editingIndex === index ? (
                                <input
                                    type="text"
                                    value={editingText}
                                    onChange={(e) => setEditingText(e.target.value)}
                                    onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                            handleEditDescription(index, editingText);
                                            setEditingIndex(null);
                                        }
                                    }}
                                    className="flex-grow p-1 border rounded"
                                    autoFocus
                                />
                            ) : (
                                <span className="flex-grow">{item}</span>
                            )}
                            <div className="flex gap-1">
                                {editingIndex === index ? (
                                    <>
                                        <button
                                            onClick={() => {
                                                handleEditDescription(index, editingText);
                                                setEditingIndex(null);
                                            }}
                                            className="text-green-600 hover:text-green-800 font-bold px-2"
                                            title="Salva"
                                        >
                                            ✓
                                        </button>
                                        <button
                                            onClick={() => setEditingIndex(null)}
                                            className="text-zinc-500 hover:text-zinc-700 font-bold px-2"
                                            title="Annulla"
                                        >
                                            ✕
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button
                                            onClick={() => {
                                                setEditingIndex(index);
                                                setEditingText(item);
                                            }}
                                            className="text-blue-600 hover:text-blue-800 font-bold px-2"
                                            title="Modifica"
                                        >
                                            ✎
                                        </button>
                                        <button
                                            onClick={() => handleRemoveDescription(index)}
                                            className="text-red-600 hover:text-red-800 font-bold px-2"
                                            title="Elimina"
                                        >
                                            🗑
                                        </button>
                                    </>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
                <div className="flex flex-col sm:flex-row gap-2">
                    <input
                        type="text"
                        value={currentDescription}
                        onChange={(e) => setCurrentDescription(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleAddDescription()}
                        className="flex-grow p-2 border rounded"
                        placeholder="Nuova lavorazione..."
                    />
                    <div className="flex gap-2">
                        <button onClick={handleAddDescription} className="flex-1 sm:flex-none bg-zinc-700 text-white font-semibold py-2 px-4 rounded-lg hover:bg-zinc-800">Aggiungi</button>
                        <button onClick={() => setIsVoiceAssistantOpen(true)} className="flex-1 sm:flex-none bg-brand-dark text-white font-semibold py-2 px-4 rounded-lg hover:opacity-90 flex items-center justify-center gap-2" title="Usa Assistente Vocale">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7 4a3 3 0 016 0v6a3 3 0 11-6 0V4zm5 10.5a.5.5 0 01.5.5v2a.5.5 0 01-1 0v-2a.5.5 0 01.5-.5zM5 10.5a.5.5 0 01.5-.5h8a.5.5 0 010 1H5.5a.5.5 0 01-.5-.5zM5 12.5a.5.5 0 01.5-.5h4a.5.5 0 010 1h-4a.5.5 0 01-.5-.5z" clipRule="evenodd" /></svg>
                            <span className="hidden sm:inline">Assistente Vocale</span>
                            <span className="sm:hidden">Voce</span>
                        </button>
                    </div>
                </div>
            </div>
             {isVoiceAssistantOpen && <VoiceAssistant onClose={() => setIsVoiceAssistantOpen(false)} sessionId={session.id} />}


            <div className="p-4 bg-zinc-50 rounded-lg border">
                 <h3 className="font-bold text-zinc-700 mb-2">Località e Opzioni</h3>
                 <input
                    type="text"
                    placeholder="Comune o Regione dei lavori (es. 'Regione Lombardia')"
                    value={session.context.location || ''}
                    onChange={(e) => updateSessionContext({ location: e.target.value })}
                    className="w-full p-2 border rounded mb-4"
                 />
                 <input
                   type="file"
                   accept="image/*"
                   capture="environment"
                   onChange={handleImageChange}
                   ref={fileInputRef}
                   className="hidden"
                 />
                 <button onClick={() => fileInputRef.current?.click()} className="w-full text-center p-4 border-2 border-dashed rounded-lg text-zinc-500 hover:bg-zinc-100 hover:border-brand-cyan">
                    {image ? `Immagine caricata: ${image.file.name}` : "📷 Carica immagine o scatta foto dello stato attuale (Opzionale)"}
                 </button>
            </div>

            {error && <ErrorMessage message={error} />}

            <div className="pt-4">
                 <button onClick={handleGenerateProject} disabled={loading} className="w-full bg-green-600 text-white font-bold py-4 px-4 rounded-lg hover:bg-green-700 transition-colors duration-300 text-xl disabled:bg-zinc-400">
                    {loading ? 'Elaborazione in corso...' : 'Termina Sessione e Genera Computo Certificato'}
                 </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default MainApp;