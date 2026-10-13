export async function loadMediaSessionFactory(){
 return (await import('./media.js')).createMediaSession;
}
