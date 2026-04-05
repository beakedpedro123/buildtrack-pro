import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const LANG_KEY = "buildtrack_language";

export type AppLanguage = "en" | "es";

interface LanguageContextType {
  language: AppLanguage;
  setLanguage: (lang: AppLanguage) => Promise<void>;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: async () => {},
  t: (key) => key,
});

// ─── Translation Dictionary ─────────────────────────────────────────────────
// Keys are English strings, values are Mexican Spanish translations
const translations: Record<string, Record<AppLanguage, string>> = {
  // Navigation & Tabs
  "Dashboard": { en: "Dashboard", es: "Inicio" },
  "Jobs": { en: "Jobs", es: "Trabajos" },
  "Clock": { en: "Clock", es: "Reloj" },
  "Reports": { en: "Reports", es: "Reportes" },
  "My Hours": { en: "My Hours", es: "Mis Horas" },
  "Meetings": { en: "Meetings", es: "Juntas" },
  "Goals": { en: "Goals", es: "Metas" },
  "Safety": { en: "Safety", es: "Seguridad" },
  "Payroll": { en: "Payroll", es: "Nómina" },
  "Team": { en: "Team", es: "Equipo" },
  "Profile": { en: "Profile", es: "Perfil" },

  // Dashboard
  "Good morning": { en: "Good morning", es: "Buenos días" },
  "Good afternoon": { en: "Good afternoon", es: "Buenas tardes" },
  "Good evening": { en: "Good evening", es: "Buenas noches" },
  "Clocked In": { en: "Clocked In", es: "Registrado" },
  "Not Clocked In": { en: "Not Clocked In", es: "Sin Registro" },
  "Clock In": { en: "Clock In", es: "Entrada" },
  "Clock Out": { en: "Clock Out", es: "Salida" },
  "Ready to start your day": { en: "Ready to start your day", es: "Listo para empezar tu día" },
  "My Goals": { en: "My Goals", es: "Mis Metas" },
  "Daily Report": { en: "Daily Report", es: "Reporte Diario" },
  "My Jobsites": { en: "My Jobsites", es: "Mis Sitios" },
  "Sign Out": { en: "Sign Out", es: "Cerrar Sesión" },

  // Goals
  "My Tasks": { en: "My Tasks", es: "Mis Tareas" },
  "Goals & Tasks": { en: "Goals & Tasks", es: "Metas y Tareas" },
  "Punch List": { en: "Punch List", es: "Lista de Pendientes" },
  "This Week": { en: "This Week", es: "Esta Semana" },
  "No goals assigned to you this week": { en: "No goals assigned to you this week", es: "No tienes metas asignadas esta semana" },
  "Your foreman or manager will assign goals to you here.": { en: "Your foreman or manager will assign goals to you here.", es: "Tu capataz o gerente te asignará metas aquí." },
  "completed": { en: "completed", es: "completadas" },
  "pending": { en: "pending", es: "pendiente" },
  "in_progress": { en: "in progress", es: "en progreso" },
  "cancelled": { en: "cancelled", es: "cancelada" },

  // Clock
  "Select Job Site": { en: "Select Job Site", es: "Seleccionar Sitio" },
  "Since": { en: "Since", es: "Desde" },

  // Reports
  "Work Completed": { en: "Work Completed", es: "Trabajo Completado" },
  "Notes": { en: "Notes", es: "Notas" },
  "Submit Report": { en: "Submit Report", es: "Enviar Reporte" },
  "Weather": { en: "Weather", es: "Clima" },

  // Hours
  "Download Weekly Hours": { en: "Download Weekly Hours", es: "Descargar Horas Semanales" },
  "Total Hours": { en: "Total Hours", es: "Horas Totales" },
  "Last 2 Weeks": { en: "Last 2 Weeks", es: "Últimas 2 Semanas" },
  "This Month": { en: "This Month", es: "Este Mes" },

  // Profile
  "Settings": { en: "Settings", es: "Configuración" },
  "Language": { en: "Language", es: "Idioma" },
  "English": { en: "English", es: "Inglés" },
  "Spanish": { en: "Spanish", es: "Español" },
  "App Language": { en: "App Language", es: "Idioma de la App" },

  // Roles
  "Owner": { en: "Owner", es: "Dueño" },
  "Office Manager": { en: "Office Manager", es: "Gerente de Oficina" },
  "Logistics": { en: "Logistics", es: "Logística" },
  "Foreman": { en: "Foreman", es: "Capataz" },
  "Laborer": { en: "Laborer", es: "Trabajador" },

  // Common
  "Cancel": { en: "Cancel", es: "Cancelar" },
  "Save": { en: "Save", es: "Guardar" },
  "Delete": { en: "Delete", es: "Eliminar" },
  "Edit": { en: "Edit", es: "Editar" },
  "Add": { en: "Add", es: "Agregar" },
  "Close": { en: "Close", es: "Cerrar" },
  "Loading...": { en: "Loading...", es: "Cargando..." },
  "Error": { en: "Error", es: "Error" },
  "Success": { en: "Success", es: "Éxito" },
  "Confirm": { en: "Confirm", es: "Confirmar" },
  "Yes": { en: "Yes", es: "Sí" },
  "No": { en: "No", es: "No" },

  // Laborer daily messages (Spanish versions)
  "Let's build something great today!": { en: "Let's build something great today!", es: "¡Vamos a construir algo grande hoy!" },
  "Hard work pays off — keep it up!": { en: "Hard work pays off — keep it up!", es: "¡El trabajo duro da frutos — sigue así!" },
  "Safety first, quality always.": { en: "Safety first, quality always.", es: "Seguridad primero, calidad siempre." },
  "Another day to make progress!": { en: "Another day to make progress!", es: "¡Otro día para avanzar!" },
  "Your work matters. Stay focused!": { en: "Your work matters. Stay focused!", es: "Tu trabajo importa. ¡Mantente enfocado!" },
  "Great things are built one day at a time.": { en: "Great things are built one day at a time.", es: "Las grandes cosas se construyen un día a la vez." },
  "Stay safe, stay sharp.": { en: "Stay safe, stay sharp.", es: "Mantente seguro, mantente alerta." },
  "Let's get it done right!": { en: "Let's get it done right!", es: "¡Hagámoslo bien!" },
  "Consistency builds excellence.": { en: "Consistency builds excellence.", es: "La constancia construye la excelencia." },
  "Every brick counts. Keep going!": { en: "Every brick counts. Keep going!", es: "¡Cada ladrillo cuenta. Sigue adelante!" },
  "Show up, work hard, be proud of what you build.": { en: "Show up, work hard, be proud of what you build.", es: "Preséntate, trabaja duro, siéntete orgulloso de lo que construyes." },
  "The best workers don't cut corners — they set standards.": { en: "The best workers don't cut corners — they set standards.", es: "Los mejores trabajadores no toman atajos — establecen estándares." },
  "Your hands are building someone's dream. That matters.": { en: "Your hands are building someone's dream. That matters.", es: "Tus manos están construyendo el sueño de alguien. Eso importa." },
  "Skill + effort = unstoppable. Keep at it.": { en: "Skill + effort = unstoppable. Keep at it.", es: "Habilidad + esfuerzo = imparable. ¡Dale con todo!" },
};

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLangState] = useState<AppLanguage>("en");

  useEffect(() => {
    AsyncStorage.getItem(LANG_KEY).then((val) => {
      if (val === "es" || val === "en") setLangState(val);
    });
  }, []);

  const setLanguage = useCallback(async (lang: AppLanguage) => {
    setLangState(lang);
    await AsyncStorage.setItem(LANG_KEY, lang);
  }, []);

  const t = useCallback((key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] || key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
