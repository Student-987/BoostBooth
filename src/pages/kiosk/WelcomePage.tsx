import { ArrowRight, FolderOpen, Lock } from 'lucide-react';
import defaultHero0 from '../../assets/images/welcome_studio_hero_1795415053626.jpg';
import defaultHero1 from '../../assets/images/welcome_booth_couple_1795415054211.jpg';
import defaultHero2 from '../../assets/images/welcome_booth_party_1795415053857.jpg';
import type { BoothSettings } from '../../types';

interface WelcomePageProps {
  settings: BoothSettings;
  activeFrameCount: number;
  onStart: () => void;
  onOpenAdmin: () => void;
  onOpenStation?: () => void;
}

const DEFAULT_HERO_IMAGES = [defaultHero0, defaultHero1, defaultHero2];

function resolveHeroImage(configuredUrl: string | undefined, idx: number): string {
  if (!configuredUrl || configuredUrl.startsWith('/src/assets/images/')) {
    return DEFAULT_HERO_IMAGES[idx];
  }
  return configuredUrl;
}

export function WelcomePage({
  settings,
  activeFrameCount,
  onStart,
  onOpenAdmin,
  onOpenStation,
}: WelcomePageProps) {
  const isMaintenance = settings.system_status === 'maintenance';

  const headline =
    settings.welcome_headline?.trim() || 'Step in, strike a pose, and take the moment home.';
  const subtitle = settings.welcome_subtitle?.trim() || '';
  const ctaLabel = settings.welcome_cta_label?.trim() || 'START';

  const heroImages = [
    resolveHeroImage(settings.welcome_hero_images?.[0], 0),
    resolveHeroImage(settings.welcome_hero_images?.[1], 1),
    resolveHeroImage(settings.welcome_hero_images?.[2], 2),
  ];

  return (
    <div
      className="min-h-screen bg-white text-zinc-900 flex flex-col justify-between relative overflow-hidden"
      style={
        settings.welcome_bg_url
          ? {
              backgroundImage: `linear-gradient(rgba(255,255,255,0.88), rgba(255,255,255,0.95)), url(${settings.welcome_bg_url})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      {/* Top Bar */}
      <header className="w-full max-w-7xl mx-auto px-6 py-5 flex items-center justify-between gap-6 border-b border-[#EFEAEC] relative z-10">
        <div className="flex items-center gap-3 min-w-0">
          {settings.logo_url ? (
            <img
              src={settings.logo_url}
              alt={settings.booth_name}
              referrerPolicy="no-referrer"
              className="h-10 w-10 rounded-xl object-cover border border-[#EFEAEC] shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-xl bg-[#7A1C2C] text-white flex items-center justify-center font-display font-bold text-lg shrink-0">
              B
            </div>
          )}
          <span className="font-display text-xl font-semibold tracking-tight text-zinc-950 whitespace-nowrap truncate">
            {settings.booth_name}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {onOpenStation && (
            <button
              type="button"
              onClick={onOpenStation}
              className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-xs font-medium text-zinc-700 hover:text-[#7A1C2C] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Staff Station</span>
            </button>
          )}
          <button
            type="button"
            onClick={onOpenAdmin}
            className="min-h-[42px] px-3.5 py-2 rounded-xl border border-[#E5DADF] bg-white hover:bg-[#FDF2F4] text-xs font-medium text-zinc-700 hover:text-[#7A1C2C] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>
      </header>

      {/* Main Hero */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-8 md:py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center relative z-10">
        {/* Left: Editorial Headline & Start CTA */}
        <div className="lg:col-span-6 flex flex-col items-start">
          <p className="text-sm font-semibold text-[#7A1C2C] uppercase tracking-[0.14em]">
            {settings.event_name}
          </p>
          <h1 className="mt-3 font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-zinc-950 leading-[1.06] [text-wrap:balance]">
            {headline}
          </h1>

          {subtitle && (
            <p className="mt-5 text-base sm:text-lg text-zinc-600 max-w-xl leading-relaxed">
              {subtitle}
            </p>
          )}

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={onStart}
              disabled={isMaintenance || activeFrameCount === 0}
              className="min-h-[64px] px-11 py-4 rounded-2xl bg-[#7A1C2C] hover:bg-[#611421] active:scale-[0.98] text-white font-display font-bold text-xl tracking-wide transition-all inline-flex items-center gap-3 shadow-xl shadow-[#7A1C2C]/20 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              <span>{isMaintenance ? 'Maintenance' : ctaLabel}</span>
              <ArrowRight className="w-6 h-6" />
            </button>
          </div>

          {activeFrameCount === 0 && (
            <p className="mt-4 text-sm text-[#7A1C2C]">
              No active frames available. Add or activate a frame in Admin.
            </p>
          )}
        </div>

        {/* Right: Decorative Showcase */}
        <div className="lg:col-span-6 grid grid-cols-12 gap-4 items-stretch">
          <div className="col-span-7 rounded-3xl overflow-hidden bg-[#FBF9FA] border border-[#EFEAEC] aspect-[3/4] shadow-sm">
            <img
              src={heroImages[0]}
              alt="Showcase 1"
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          </div>
          <div className="col-span-5 flex flex-col gap-4">
            <div className="flex-1 rounded-3xl overflow-hidden bg-[#FBF9FA] border border-[#EFEAEC] shadow-sm">
              <img
                src={heroImages[1]}
                alt="Showcase 2"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex-1 rounded-3xl overflow-hidden bg-[#FBF9FA] border border-[#EFEAEC] shadow-sm">
              <img
                src={heroImages[2]}
                alt="Showcase 3"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
