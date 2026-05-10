/**
 * Canonical role strings for profiles (`users.role`) and viewer routing.
 * Prefer these over scattering string literals.
 */
export const USER_ROLE = {
  CUSTOMER: 'customer',
  DRIVER: 'driver',
  RESTAURANT: 'restaurant',
  ADMIN: 'admin',
  /** Stripe venue owner — treated like restaurant for order screens. */
  HOST: 'host',
  /** Legacy shoppers — equivalent to CUSTOMER for UX. */
  USER: 'user',
} as const;

export type UserRoleConstant = (typeof USER_ROLE)[keyof typeof USER_ROLE];
