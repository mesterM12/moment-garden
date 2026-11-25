export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initializeSocialRenderer, registerSocialShutdown } = await import('../server/social')
    await initializeSocialRenderer()
    registerSocialShutdown()
  }
}
