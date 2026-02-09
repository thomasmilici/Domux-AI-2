# Come Controllare i Log dell'Errore

## ⚡ METODO PIÙ VELOCE (Console Browser)

1. **Apri la console del browser** dove hai fatto il test
   - Premi `F12` o `Ctrl+Shift+I` (Windows/Linux)
   - Oppure `Cmd+Option+I` (Mac)

2. **Vai nella tab "Console"**

3. **Esegui questo comando**:
   ```javascript
   (async () => {
     const logs = await Logger.getRecentLogs(50);
     const errors = logs.filter(l => l.level === 'error');
     console.log('🔴 ERRORI TROVATI:', errors.length);
     errors.forEach((e, i) => {
       console.log(`\n━━━ ERRORE #${i+1} ━━━`);
       console.log('Timestamp:', e.timestampISO);
       console.log('Message:', e.message);
       console.log('Session:', e.sessionId);
       console.log('Context:', e.context);
     });
     return errors;
   })();
   ```

4. **Copia l'output** e mandamelo

---

## 🌐 METODO FIREBASE CONSOLE

1. Vai su: https://console.firebase.google.com/project/progettista-ai/firestore/databases/-default-/data/~2Flogs

2. Clicca su qualsiasi documento recente

3. Cerca documenti con `level: "error"`

4. Copia il contenuto del campo `message` e `context`

---

## 📱 METODO LOG VIEWER (se hai accesso)

1. Apri l'app
2. Vai su `/logs` nell'URL
3. Filtra per "Errori"
4. Fai screenshot degli ultimi 5 errori

---

## 🚀 METODO VELOCISSIMO (Per Me)

**Dimmi solo:**
1. A che ora hai fatto il test (es: "5 minuti fa", "12:30")
2. Cosa hai fatto esattamente (es: "caricato immagine e cliccato genera")
3. Cosa è apparso sullo schermo (es: "tornato alla home", "errore X")

E io controllo i log su Firebase Console direttamente!
