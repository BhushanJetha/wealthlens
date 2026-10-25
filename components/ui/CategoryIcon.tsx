'use client'
import {
  Utensils, ShoppingBag, ShoppingCart, Zap, Car, Fuel, Bus, HeartPulse, Pill, Sparkles, Clapperboard, Gamepad2, Music,
  Plane, TreePalm, PartyPopper, GraduationCap, BookOpen, Repeat, Wifi, Smartphone, TrendingUp, Landmark, Banknote,
  CreditCard, Users, Baby, PawPrint, Undo2, MoreHorizontal, Briefcase, Building2, ArrowDownLeft, Coins, Percent,
  PiggyBank, Home, Gift, Receipt, Wallet, HandCoins, Coffee, Shirt, Wrench, Dumbbell, Tag, type LucideIcon,
} from 'lucide-react'

// Icons a category can use (key stored in categories.icon)
export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils, coffee: Coffee, 'shopping-bag': ShoppingBag, cart: ShoppingCart, shirt: Shirt, zap: Zap, wifi: Wifi,
  phone: Smartphone, home: Home, wrench: Wrench, car: Car, fuel: Fuel, bus: Bus, plane: Plane, 'tree-palm': TreePalm,
  'heart-pulse': HeartPulse, pill: Pill, dumbbell: Dumbbell, sparkles: Sparkles, clapperboard: Clapperboard, gamepad: Gamepad2,
  music: Music, 'party-popper': PartyPopper, gift: Gift, 'graduation-cap': GraduationCap, book: BookOpen, baby: Baby,
  paw: PawPrint, users: Users, repeat: Repeat, receipt: Receipt, landmark: Landmark, banknote: Banknote,
  'credit-card': CreditCard, 'trending-up': TrendingUp, 'piggy-bank': PiggyBank, coins: Coins, percent: Percent,
  wallet: Wallet, 'hand-coins': HandCoins, briefcase: Briefcase, building: Building2, 'arrow-down-left': ArrowDownLeft,
  undo: Undo2, tag: Tag, more: MoreHorizontal,
}

export function CategoryIcon({ icon, size = 15 }: { icon?: string | null; size?: number }) {
  const I = (icon && CATEGORY_ICONS[icon]) || Tag
  return <I size={size} />
}
