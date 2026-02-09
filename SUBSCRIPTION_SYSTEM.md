# Sistema di Tier e Abbonamenti - Versione 0.5

## 📋 Panoramica

Il sistema di tier è stato implementato per gestire diversi livelli di servizio con prova gratuita di 7 giorni e preparazione per l'integrazione PayPal.

## 🎯 Tier Disponibili

### 1. **Free Trial** (Prova Gratuita) 🎁
- **Durata**: 7 giorni
- **Progetti/mese**: 3
- **Sessioni attive**: 2
- **Immagini per progetto**: 1
- **Servizi avanzati**: ❌
- **Servizi premium**: ❌
- **Supporto prioritario**: ❌
- **Logo personalizzato**: ❌
- **Accesso API**: ❌

### 2. **Basic** ⭐
- **Prezzo**: €19.99/mese (€199.99/anno)
- **Progetti/mese**: 20
- **Sessioni attive**: 5
- **Immagini per progetto**: 3
- **Servizi avanzati**: ❌
- **Servizi premium**: ❌
- **Supporto prioritario**: ❌
- **Logo personalizzato**: ❌
- **Accesso API**: ❌

### 3. **Professional** 💎
- **Prezzo**: €49.99/mese (€499.99/anno)
- **Progetti/mese**: 100
- **Sessioni attive**: 15
- **Immagini per progetto**: 10
- **Servizi avanzati**: ✅
- **Servizi premium**: ❌
- **Supporto prioritario**: ✅
- **Logo personalizzato**: ✅
- **Accesso API**: ❌

### 4. **Enterprise** 👑
- **Prezzo**: €99.99/mese (€999.99/anno)
- **Progetti/mese**: Illimitati
- **Sessioni attive**: Illimitate
- **Immagini per progetto**: Illimitate
- **Servizi avanzati**: ✅
- **Servizi premium**: ✅
- **Supporto prioritario**: ✅
- **Logo personalizzato**: ✅
- **Accesso API**: ✅

## 📁 Struttura File

```
types/
  └── subscription.ts          # Tipi, interfacce e configurazione tier

services/
  └── subscriptionService.ts   # Logica business per tier e permessi

components/
  └── subscription/
      ├── TierGuard.tsx        # Componente per proteggere feature
      ├── SubscriptionStatus.tsx # Visualizzazione stato subscription
      └── PricingPlans.tsx     # Pagina prezzi e piani
```

## 🔧 Utilizzo

### 1. Proteggere una Feature per Tier

```tsx
import { TierGuard } from './components/subscription/TierGuard';

function MyComponent({ user }) {
  return (
    <TierGuard user={user} requiredTier="professional">
      <AdvancedFeature />
    </TierGuard>
  );
}
```

### 2. Proteggere una Feature Specifica

```tsx
import { TierGuard } from './components/subscription/TierGuard';

function MyComponent({ user }) {
  return (
    <TierGuard user={user} requiredFeature="canAccessAdvancedServices">
      <AdvancedService />
    </TierGuard>
  );
}
```

### 3. Verificare Permessi in Codice

```tsx
import { canUserAccessFeature, hasRequiredTier } from './services/subscriptionService';

function handleAction(user) {
  if (!canUserAccessFeature(user, 'canAccessPremiumServices')) {
    alert('Questa funzionalità richiede un piano Enterprise');
    return;
  }

  // Procedi con l'azione
}
```

### 4. Verificare Limiti

```tsx
import { canCreateProject, canCreateSession } from './services/subscriptionService';

async function createNewProject(user) {
  const result = await canCreateProject(user);

  if (!result.allowed) {
    alert(result.reason);
    return;
  }

  // Crea il progetto
}
```

### 5. Visualizzare Stato Subscription

```tsx
import SubscriptionStatus from './components/subscription/SubscriptionStatus';

function Dashboard({ user }) {
  return (
    <div>
      <SubscriptionStatus user={user} showDetails={true} />
      {/* Altri contenuti */}
    </div>
  );
}
```

### 6. Mostrare Piani di Pricing

```tsx
import PricingPlans from './components/subscription/PricingPlans';

function UpgradePage({ user }) {
  const handleSelectPlan = (tier) => {
    // Qui andrà l'integrazione PayPal
    console.log('Selected tier:', tier);
  };

  return <PricingPlans user={user} onSelectPlan={handleSelectPlan} />;
}
```

## 🔄 Flusso Automatico

### Registrazione Nuovo Utente
1. L'utente si registra (email/password o Google)
2. Viene creato il documento utente in Firestore
3. **Automaticamente** viene inizializzato il trial gratuito di 7 giorni
4. L'utente può iniziare a usare l'app con le limitazioni del trial

### Scadenza Trial
- Il sistema verifica automaticamente se il trial è scaduto
- Se scaduto, l'utente mantiene il tier "free_trial" ma con accesso bloccato
- Viene mostrato un messaggio per effettuare l'upgrade

## 🛠️ Funzioni Utility Disponibili

### subscriptionService.ts

```typescript
// Inizializza trial (chiamata automatica alla registrazione)
initializeFreeTrial(userId: string): Promise<void>

// Verifica scadenza trial
isTrialExpired(subscription: UserSubscription): boolean

// Verifica se subscription è attiva
isSubscriptionActive(subscription: UserSubscription): boolean

// Ottiene tier effettivo (gestisce trial scaduti)
getEffectiveTier(user: User): SubscriptionTier

// Ottiene configurazione features per l'utente
getUserTierFeatures(user: User): TierFeatures

// Verifica accesso a feature specifica
canUserAccessFeature(user: User, feature: keyof TierFeatures): boolean

// Verifica tier minimo richiesto
hasRequiredTier(user: User, requiredTier: SubscriptionTier): boolean

// Conta progetti mensili
getMonthlyProjectCount(userId: string): Promise<number>

// Conta sessioni attive
getActiveSessionCount(userId: string): Promise<number>

// Verifica se può creare progetto
canCreateProject(user: User): Promise<{ allowed: boolean; reason?: string }>

// Verifica se può creare sessione
canCreateSession(user: User): Promise<{ allowed: boolean; reason?: string }>

// Aggiorna tier utente (per admin o dopo pagamento)
updateUserTier(userId: string, tier: SubscriptionTier, paymentStatus: PaymentStatus, subscriptionData?: Partial<UserSubscription>): Promise<void>

// Calcola giorni rimanenti trial
getTrialDaysRemaining(subscription: UserSubscription): number

// Messaggio user-friendly stato subscription
getSubscriptionStatusMessage(user: User): string
```

## 📊 Struttura Dati Firestore

### Documento Utente (`users/{userId}`)

```typescript
{
  uid: string,
  email: string,
  role: 'user' | 'collaborator' | 'admin' | 'superadmin',
  subscription: {
    tier: 'free_trial' | 'basic' | 'professional' | 'enterprise',
    paymentStatus: 'trial' | 'active' | 'expired' | 'cancelled' | 'pending',
    trialStartDate: Timestamp,  // Solo per free_trial
    trialEndDate: Timestamp,    // Solo per free_trial
    subscriptionStartDate: Timestamp,  // Per tier a pagamento
    subscriptionEndDate?: Timestamp,   // Opzionale
    lastPaymentDate?: Timestamp,
    nextBillingDate?: Timestamp,
    paypalSubscriptionId?: string,  // Per integrazione PayPal futura
    paypalOrderId?: string
  }
}
```

## 🎨 Esempi di Integrazione

### Esempio 1: Dashboard con Verifica Tier

```tsx
import React from 'react';
import { TierGuard, useTierAccess } from './components/subscription/TierGuard';
import SubscriptionStatus from './components/subscription/SubscriptionStatus';

function Dashboard({ user }) {
  const { hasAccess, features, statusMessage } = useTierAccess(user, 'professional');

  return (
    <div>
      <SubscriptionStatus user={user} showDetails />

      {/* Servizi base - accessibili a tutti */}
      <BasicServices />

      {/* Servizi avanzati - solo Professional e Enterprise */}
      <TierGuard user={user} requiredFeature="canAccessAdvancedServices">
        <AdvancedServices />
      </TierGuard>

      {/* Servizi premium - solo Enterprise */}
      <TierGuard user={user} requiredFeature="canAccessPremiumServices">
        <PremiumServices />
      </TierGuard>
    </div>
  );
}
```

### Esempio 2: Creazione Progetto con Limiti

```tsx
import { canCreateProject } from './services/subscriptionService';

async function handleCreateProject(user) {
  // Verifica se può creare un progetto
  const result = await canCreateProject(user);

  if (!result.allowed) {
    // Mostra messaggio di errore
    showUpgradeModal(result.reason);
    return;
  }

  // Procedi con la creazione del progetto
  createProject();
}
```

### Esempio 3: Admin Panel - Gestione Tier

```tsx
import { updateUserTier } from './services/subscriptionService';

async function handleUpgradeUser(userId, newTier) {
  await updateUserTier(userId, newTier, 'active', {
    subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 giorni
  });

  alert('Utente aggiornato con successo!');
}
```

## 🚀 Prossimi Passi (Integrazione PayPal)

1. **Creare pagina Checkout**
   - Componente per selezionare piano (mensile/annuale)
   - Integrazione con PayPal JavaScript SDK

2. **Implementare Webhook PayPal**
   - Endpoint per ricevere notifiche di pagamento
   - Aggiornamento automatico tier dopo pagamento

3. **Gestione Rinnovi**
   - Sistema automatico di verifica scadenze
   - Email di promemoria prima della scadenza

4. **Dashboard Pagamenti**
   - Storico pagamenti
   - Download fatture
   - Gestione abbonamento (cancellazione, upgrade, downgrade)

## 📝 Note Importanti

- ✅ Tutti i nuovi utenti ricevono **automaticamente** 7 giorni di trial
- ✅ Il sistema verifica **automaticamente** la scadenza del trial
- ✅ I limiti vengono applicati **in tempo reale**
- ✅ Admin e SuperAdmin **non sono soggetti** ai limiti dei tier
- ⚠️ L'integrazione PayPal è **preparata ma non ancora implementata**
- ⚠️ I prezzi possono essere modificati in `types/subscription.ts`

## 🔒 Sicurezza

- Tutte le verifiche sono effettuate **lato server** tramite Firestore
- I conteggi sono calcolati in tempo reale da Firestore
- Gli utenti non possono modificare il proprio tier direttamente
- Solo admin possono aggiornare manualmente i tier

## 🎯 Modifica Configurazione Tier

Per modificare limiti o prezzi, edita il file `types/subscription.ts`:

```typescript
export const TIER_CONFIG: Record<SubscriptionTier, TierFeatures> = {
  basic: {
    // ... modifica qui
    maxProjectsPerMonth: 30, // Esempio: aumenta a 30
    monthlyPrice: 24.99,     // Esempio: nuovo prezzo
  },
  // ...
};
```

---

**Versione**: 0.5
**Data**: 2025-11-17
**Autore**: Claude AI Assistant
