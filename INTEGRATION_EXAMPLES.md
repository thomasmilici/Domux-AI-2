# Esempi di Integrazione Sistema Tier v0.5

## 📌 Come Integrare il Sistema di Tier nelle Sezioni Esistenti

### 1. Aggiungere Verifica Tier alla Creazione Progetto

**File**: `components/dashboard/UserDashboard.tsx`

```tsx
import { canCreateProject } from '../../services/subscriptionService';
import SubscriptionStatus from '../subscription/SubscriptionStatus';

// All'inizio del render della dashboard
return (
  <div>
    {/* Mostra stato subscription */}
    <SubscriptionStatus user={user} showDetails={false} />

    {/* ... resto del codice esistente ... */}
  </div>
);

// Quando l'utente clicca "Nuovo Progetto"
const handleNewProject = async () => {
  const result = await canCreateProject(user);

  if (!result.allowed) {
    alert(result.reason);
    // Opzionale: mostra modal per upgrade
    return;
  }

  // Procedi con la creazione del progetto esistente
  setActiveView('new-project');
};
```

### 2. Proteggere Sezioni Premium nella Dashboard

**File**: `components/dashboard/UserDashboard.tsx`

```tsx
import { TierGuard } from '../subscription/TierGuard';

// Nel render, aggiungi sezioni protette
return (
  <div>
    {/* Sezioni base - tutti possono vedere */}
    <BasicSection />

    {/* Sezione Servizi Avanzati - solo Professional+ */}
    <TierGuard user={user} requiredFeature="canAccessAdvancedServices">
      <div className="advanced-services">
        <h3>🔧 Servizi Avanzati</h3>
        <p>Funzionalità riservate ai piani Professional ed Enterprise</p>
        {/* Contenuto avanzato */}
      </div>
    </TierGuard>

    {/* Sezione Premium - solo Enterprise */}
    <TierGuard user={user} requiredFeature="canAccessPremiumServices">
      <div className="premium-services">
        <h3>👑 Servizi Premium</h3>
        <p>Funzionalità esclusive del piano Enterprise</p>
        {/* Contenuto premium */}
      </div>
    </TierGuard>
  </div>
);
```

### 3. Limitare Upload Immagini per Progetto

**File**: `MainApp.tsx`

```tsx
import { getUserTierFeatures } from './services/subscriptionService';

const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const features = getUserTierFeatures(user);

  // Conta immagini già caricate nel progetto corrente
  const currentImageCount = getCurrentProjectImageCount();

  if (features.maxImageUploadsPerProject !== -1 &&
      currentImageCount >= features.maxImageUploadsPerProject) {
    alert(`Hai raggiunto il limite di ${features.maxImageUploadsPerProject} immagini per il tuo piano.`);
    return;
  }

  // Procedi con l'upload esistente
  // ... codice esistente ...
};
```

### 4. Verificare Sessioni Attive

**File**: `components/dashboard/UserDashboard.tsx`

```tsx
import { canCreateSession, getActiveSessionCount } from '../../services/subscriptionService';

const handleResumeSession = async (sessionId: string) => {
  const result = await canCreateSession(user);

  if (!result.allowed) {
    alert(result.reason);
    return;
  }

  // Resume della sessione esistente
  // ... codice esistente ...
};
```

### 5. Mostrare Piani nella Dashboard

**File**: `components/dashboard/UserDashboard.tsx`

```tsx
import PricingPlans from '../subscription/PricingPlans';
import { getEffectiveTier } from '../../services/subscriptionService';

const [showPricing, setShowPricing] = useState(false);

// Nel render
return (
  <div>
    {/* Bottone per mostrare piani */}
    <button onClick={() => setShowPricing(true)}>
      Visualizza Piani
    </button>

    {/* Modal con piani (opzionale) */}
    {showPricing && (
      <div className="modal">
        <PricingPlans
          user={user}
          onSelectPlan={(tier) => {
            // TODO: Integrazione PayPal
            console.log('Selected:', tier);
          }}
        />
        <button onClick={() => setShowPricing(false)}>Chiudi</button>
      </div>
    )}
  </div>
);
```

### 6. Admin Dashboard - Gestione Tier Utenti

**File**: `components/admin/AdminDashboard.tsx`

```tsx
import { updateUserTier } from '../../services/subscriptionService';
import type { SubscriptionTier } from '../../types/subscription';

const handleChangeTier = async (userId: string, newTier: SubscriptionTier) => {
  try {
    await updateUserTier(userId, newTier, 'active', {
      subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
    alert('Tier aggiornato con successo!');
  } catch (error) {
    alert('Errore nell\'aggiornamento del tier');
  }
};

// Nel render della lista utenti
return (
  <table>
    {users.map(user => (
      <tr key={user.uid}>
        <td>{user.email}</td>
        <td>
          <select
            value={user.subscription?.tier || 'free_trial'}
            onChange={(e) => handleChangeTier(user.uid, e.target.value as SubscriptionTier)}
          >
            <option value="free_trial">Free Trial</option>
            <option value="basic">Basic</option>
            <option value="professional">Professional</option>
            <option value="enterprise">Enterprise</option>
          </select>
        </td>
      </tr>
    ))}
  </table>
);
```

### 7. Verificare Trial Scaduto all'Avvio App

**File**: `App.tsx`

```tsx
import { isSubscriptionActive, getTrialDaysRemaining } from './services/subscriptionService';

useEffect(() => {
  if (user && user.subscription) {
    if (!isSubscriptionActive(user.subscription)) {
      // Mostra banner di trial scaduto
      showTrialExpiredBanner();
    } else if (user.subscription.tier === 'free_trial') {
      const daysRemaining = getTrialDaysRemaining(user.subscription);
      if (daysRemaining <= 3) {
        // Mostra reminder se mancano 3 giorni o meno
        showTrialExpiringReminder(daysRemaining);
      }
    }
  }
}, [user]);
```

## 🎨 Esempio Completo: Sezione Premium

Ecco come creare una nuova sezione visibile solo ai tier più alti:

```tsx
// components/dashboard/PremiumSection.tsx
import React from 'react';
import { TierGuard } from '../subscription/TierGuard';
import type { User } from '../../services/firebase';

interface PremiumSectionProps {
  user: User;
}

export const PremiumSection: React.FC<PremiumSectionProps> = ({ user }) => {
  return (
    <TierGuard
      user={user}
      requiredFeature="canAccessPremiumServices"
      showUpgradeMessage={true}
    >
      <div style={{
        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        borderRadius: '12px',
        padding: '32px',
        color: 'white',
        margin: '20px 0'
      }}>
        <h2>👑 Servizi Premium Enterprise</h2>

        <div style={{ marginTop: '24px' }}>
          <h3>🚀 Funzionalità Esclusive:</h3>
          <ul>
            <li>Generazione computi illimitati</li>
            <li>Accesso API completo</li>
            <li>Analisi avanzate con AI</li>
            <li>Integrazioni personalizzate</li>
            <li>Supporto dedicato 24/7</li>
          </ul>
        </div>

        <div style={{ marginTop: '24px' }}>
          <button
            style={{
              padding: '12px 32px',
              backgroundColor: 'white',
              color: '#4facfe',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: 'bold',
              cursor: 'pointer'
            }}
            onClick={() => {
              // Apri servizio premium
              console.log('Apri servizio premium');
            }}
          >
            Accedi ai Servizi
          </button>
        </div>
      </div>
    </TierGuard>
  );
};
```

Poi nel file `UserDashboard.tsx`:

```tsx
import { PremiumSection } from './PremiumSection';

// Nel render
return (
  <div>
    {/* ... altri contenuti ... */}

    {/* Questa sezione si mostrerà solo agli utenti Enterprise */}
    <PremiumSection user={user} />
  </div>
);
```

## 📊 Hook React Personalizzato

Crea un hook per semplificare l'uso del sistema tier:

```tsx
// hooks/useSubscription.ts
import { useMemo } from 'react';
import type { User } from '../services/firebase';
import {
  getEffectiveTier,
  getUserTierFeatures,
  isSubscriptionActive,
  getTrialDaysRemaining,
  getSubscriptionStatusMessage
} from '../services/subscriptionService';

export function useSubscription(user: User) {
  return useMemo(() => {
    const tier = getEffectiveTier(user);
    const features = getUserTierFeatures(user);
    const isActive = isSubscriptionActive(user.subscription);
    const daysRemaining = tier === 'free_trial' ? getTrialDaysRemaining(user.subscription) : null;
    const statusMessage = getSubscriptionStatusMessage(user);

    return {
      tier,
      features,
      isActive,
      daysRemaining,
      statusMessage,
      isTrial: tier === 'free_trial',
      isTrialExpiring: daysRemaining !== null && daysRemaining <= 3,
    };
  }, [user]);
}
```

Utilizzo:

```tsx
import { useSubscription } from '../hooks/useSubscription';

function MyComponent({ user }) {
  const { tier, features, isTrialExpiring, daysRemaining } = useSubscription(user);

  return (
    <div>
      <p>Piano: {tier}</p>
      {isTrialExpiring && (
        <div className="alert">
          Il tuo trial scade tra {daysRemaining} giorni!
        </div>
      )}
    </div>
  );
}
```

## 🔔 Banner Trial Scadenza

```tsx
// components/TrialExpiringBanner.tsx
import React from 'react';
import { useSubscription } from '../hooks/useSubscription';
import type { User } from '../services/firebase';

export const TrialExpiringBanner: React.FC<{ user: User }> = ({ user }) => {
  const { isTrialExpiring, daysRemaining, isTrial } = useSubscription(user);

  if (!isTrial || !isTrialExpiring) {
    return null;
  }

  return (
    <div style={{
      background: '#ff9800',
      color: 'white',
      padding: '16px',
      textAlign: 'center',
      borderRadius: '8px',
      margin: '16px 0'
    }}>
      <strong>⚠️ Attenzione!</strong> La tua prova gratuita scade tra {daysRemaining} giorni.
      <button
        style={{
          marginLeft: '16px',
          padding: '8px 16px',
          backgroundColor: 'white',
          color: '#ff9800',
          border: 'none',
          borderRadius: '4px',
          fontWeight: 'bold',
          cursor: 'pointer'
        }}
        onClick={() => {
          // TODO: Naviga a pricing
          alert('Pagina pricing');
        }}
      >
        Effettua l'Upgrade
      </button>
    </div>
  );
};
```

---

**Questi esempi mostrano come integrare facilmente il sistema di tier in tutte le parti dell'applicazione!**
