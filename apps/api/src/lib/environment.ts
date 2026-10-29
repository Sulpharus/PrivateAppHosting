/** Which deploy environment this API belongs to (the workflows take it as an input). */
export function deployEnvironment(env: { DEPLOY_ENVIRONMENT: string }): 'production' | 'staging' {
  return env.DEPLOY_ENVIRONMENT === 'staging' ? 'staging' : 'production';
}
