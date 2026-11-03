/* Public settings for the officials' sign-in. Both values are safe to publish:
   the anon key only reads public data, and every write is checked by the database.
   Leave them empty to keep using access codes. */
window.CAMP_CFG = {
  supabaseUrl: "https://vjnbuvkwmkdgewmbpbck.supabase.co",
  supabaseAnon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZqbmJ1dmt3bWtkZ2V3bWJwYmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2ODA1NjgsImV4cCI6MjEwOTI1NjU2OH0.rmTYwpF8VILCPxOX-RyrxXV-2lTocj0914VlPGi3oPo",
  vapidPublic: "BF9GTO3n1Ew1LOauLuXgbC-9cosb_OJgk8CqRqURRpLB8ebmynNjtXlOXJULpE9TBq91Jc3u3fWad6SMAlwIgBE"
};
