// Tipos compartidos entre el server action layer y los componentes móviles.
// Vive aparte de mobile-actions.ts porque ese fichero usa "use server" y
// solo permite exports de funciones async.

export interface MobilePerson {
  id: string;
  full_name: string;
  role: string | null;
  company: string | null;
}
