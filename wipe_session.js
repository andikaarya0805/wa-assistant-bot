import { deleteSession } from './services/supabaseService.js';

(async () => {
    console.log("--- Manually Deleting Session from Supabase ---");
    await deleteSession();
    console.log("--- Done. Session wiped. ---");
})();
