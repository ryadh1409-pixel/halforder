/**
 * Canonical role strings for profiles (`users.role`) and viewer routing.
 * Prefer these over scattering string literals.
 */
export const USER_ROLE = {
  /** Default marketplace customer (`users.role`). */
  USER: 'user',
  /** @deprecated Use {@link USER_ROLE.USER} — kept for legacy reads. */
  CUSTOMER: 'user',
  DRIVER: 'driver',
  RESTAURANT: 'restaurant',
  ADMIN: 'admin',
  /** Stripe venue owner — normalized to restaurant for routing. */
  HOST: 'host',
} as const;

export type UserRoleConstant = (typeof USER_ROLE)[keyof typeof USER_ROLE];
