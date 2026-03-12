#pragma once
#include "config.h"
#include <math.h>

// ────────────────────────────────────────────────────────────────
//  WLED FX.cpp port for C++/FastLED
//  ~40 effects, all referenced to WLED source IDs
// ────────────────────────────────────────────────────────────────


// FastLED Wheel — maps 0-255 to smooth rainbow
static CRGB colorWheel(uint8_t pos) {
  if (pos < 85)  return CRGB(255-pos*3, pos*3, 0);
  if (pos < 170) { pos-=85; return CRGB(0, 255-pos*3, pos*3); }
  pos-=170;      return CRGB(pos*3, 0, 255-pos*3);
}

// beatsin8 — oscillates between lo and hi at bpm
static uint8_t beatsin8_(uint8_t bpm, uint8_t lo, uint8_t hi, uint32_t t, uint16_t phase=0) {
  uint32_t beat = (uint32_t)bpm * t / 60000;
  uint8_t s = sin8((uint8_t)(beat + phase));
  return lo + scale8(s, hi-lo);
}

// beatsin16 — oscillates 0-65535 at bpm
static uint16_t beatsin16_(uint8_t bpm, uint16_t lo, uint16_t hi, uint32_t t, uint16_t phase=0) {
  uint32_t beat = (uint32_t)bpm * t / 60000;
  uint16_t s = (uint16_t)(sin16((uint16_t)(beat + phase)) + 32768);
  return lo + scale16(s, hi-lo);
}

// ── Effect helpers ─────────────────────────────────────────────
static void fillSolid(CRGB* leds, CRGB c) { for(int i=0;i<NUM_LEDS;i++) leds[i]=c; }
static void fadeAll  (CRGB* leds, uint8_t f) { for(int i=0;i<NUM_LEDS;i++) leds[i].nscale8(f); }
static CRGB colBr(const SegState& s) { CRGB c(s.col[0],s.col[1],s.col[2]); c.nscale8(s.bri); return c; }
static CRGB col0 (const SegState& s) { return CRGB(s.col[0],s.col[1],s.col[2]); }

// ═══════════════════════════════════════════════════════════════
//  EFFECTS
// ═══════════════════════════════════════════════════════════════

// ── fx=0  Solid ────────────────────────────────────────────────
void e_solid(Group& g) { fillSolid(g.leds, colBr(g.state)); }

// ── fx=1  Blink ────────────────────────────────────────────────
void e_blink(Group& g, uint32_t t) {
  uint32_t p = max(80u, (uint32_t)(1000 - g.state.sx*4));
  fillSolid(g.leds, (t/p)%2==0 ? colBr(g.state) : CRGB::Black);
}

// ── fx=2  Breathe ──────────────────────────────────────────────
void e_breathe(Group& g, uint32_t t) {
  // Quadratic easing like WLED: bright phase shorter than dark
  float breath = (expf(sinf(t * g.state.sx / 100000.0f)) - 0.36788f) / 2.35040f;
  CRGB c = col0(g.state); c.nscale8((uint8_t)(breath * g.state.bri));
  fillSolid(g.leds, c);
}

// ── fx=3  Color Wipe ───────────────────────────────────────────
void e_wipe(Group& g, uint32_t t) {
  CRGB c = colBr(g.state);
  uint32_t cy = (uint32_t)(t * g.state.sx / 5000.0f) % (2*NUM_LEDS);
  for(int i=0;i<NUM_LEDS;i++) {
    bool on = (cy<(uint32_t)NUM_LEDS) ? i<=(int)cy : i>(int)(cy-NUM_LEDS);
    g.leds[i] = on ? c : CRGB::Black;
  }
}

// ── fx=5  Color Wipe Reversed ──────────────────────────────────
void e_wipe_rev(Group& g, uint32_t t) {
  CRGB c = colBr(g.state);
  uint32_t cy = (uint32_t)(t * g.state.sx / 5000.0f) % (2*NUM_LEDS);
  for(int i=0;i<NUM_LEDS;i++) {
    int ri = NUM_LEDS-1-i;
    bool on = (cy<(uint32_t)NUM_LEDS) ? ri<=(int)cy : ri>(int)(cy-NUM_LEDS);
    g.leds[i] = on ? c : CRGB::Black;
  }
}

// ── fx=4  Wipe Random ──────────────────────────────────────────
void e_wipe_random(Group& g, uint32_t t) {
  uint32_t cy = (uint32_t)(t * g.state.sx / 5000.0f) % (2*NUM_LEDS);
  uint32_t cn = (uint32_t)(t * g.state.sx / 5000.0f) / (2*NUM_LEDS);
  if (g.wrCycle != cn) { g.wrCycle=cn; g.wrCol=colorWheel(random8()); g.wrCol.nscale8(g.state.bri); }
  for(int i=0;i<NUM_LEDS;i++) {
    bool on = (cy<(uint32_t)NUM_LEDS) ? i<=(int)cy : i>(int)(cy-NUM_LEDS);
    g.leds[i] = on ? g.wrCol : CRGB::Black;
  }
}

// ── fx=8  Color Loop ───────────────────────────────────────────
void e_colorloop(Group& g, uint32_t t) {
  uint8_t it = (uint8_t)((t * g.state.sx) >> 12);
  CRGB c = colorWheel(it); c.nscale8(g.state.bri);
  fillSolid(g.leds, c);
}

// ── fx=9  Rainbow ──────────────────────────────────────────────
void e_rainbow(Group& g, uint32_t t) {
  uint8_t phase = (uint8_t)((t * g.state.sx) >> 11);
  for(int i=0;i<NUM_LEDS;i++) {
    g.leds[i] = colorWheel((uint8_t)(i*256/NUM_LEDS + phase));
    g.leds[i].nscale8(g.state.bri);
  }
}

// ── fx=10 Fade ─────────────────────────────────────────────────
void e_fade(Group& g, uint32_t t) {
  uint8_t v = triwave8((uint8_t)((t * g.state.sx) >> 12));
  CRGB c = col0(g.state); c.nscale8(scale8(v, g.state.bri));
  fillSolid(g.leds, c);
}

// ── fx=11 Larson Scanner (Knight Rider) ────────────────────────
void e_scanner(Group& g, uint32_t t) {
  uint32_t period = max(200u, 2000000u / max(1u,(uint32_t)g.state.sx));
  uint32_t tp     = t % (2*period);
  float    frac   = tp < period ? (float)tp/period : 2.0f-(float)tp/period;
  int      pos    = (int)(frac*(NUM_LEDS-1));
  fadeAll(g.leds, 192);
  CRGB c = col0(g.state);
  for(int j=0;j<5;j++) {
    int idx = constrain(pos-j, 0, NUM_LEDS-1);
    float v = (g.state.bri/255.0f) * max(0.0f, 1.0f - j*0.22f);
    g.leds[idx].r = max((int)g.leds[idx].r, (int)(c.r*v));
    g.leds[idx].g = max((int)g.leds[idx].g, (int)(c.g*v));
    g.leds[idx].b = max((int)g.leds[idx].b, (int)(c.b*v));
  }
}

// ── fx=51 Scanner Dual ─────────────────────────────────────────
void e_scanner_dual(Group& g, uint32_t t) {
  uint32_t period = max(200u, 2000000u / max(1u,(uint32_t)g.state.sx));
  uint32_t tp     = t % (2*period);
  float    frac   = tp < period ? (float)tp/period : 2.0f-(float)tp/period;
  int      pos    = (int)(frac*(NUM_LEDS/2-1));
  fadeAll(g.leds, 192);
  CRGB c = col0(g.state);
  for(int j=0;j<4;j++) {
    float v = (g.state.bri/255.0f) * max(0.0f, 1.0f - j*0.25f);
    auto paint = [&](int idx) {
      idx = constrain(idx,0,NUM_LEDS-1);
      g.leds[idx].r = max((int)g.leds[idx].r,(int)(c.r*v));
      g.leds[idx].g = max((int)g.leds[idx].g,(int)(c.g*v));
      g.leds[idx].b = max((int)g.leds[idx].b,(int)(c.b*v));
    };
    paint(pos-j);
    paint(NUM_LEDS-1-pos+j);
  }
}

// ── fx=12 Strobe ───────────────────────────────────────────────
void e_strobe(Group& g, uint32_t t) {
  uint32_t p = max(25u, (uint32_t)(270 - g.state.sx));
  fillSolid(g.leds, (t%p)<25 ? colBr(g.state) : CRGB::Black);
}

// ── fx=13 Strobe Rainbow ───────────────────────────────────────
void e_strobe_rainbow(Group& g, uint32_t t) {
  uint32_t p = max(25u, (uint32_t)(270 - g.state.sx));
  if ((t%p)<25) {
    CRGB c = colorWheel((uint8_t)(t>>3)); c.nscale8(g.state.bri);
    fillSolid(g.leds, c);
  } else fillSolid(g.leds, CRGB::Black);
}

// ── fx=16 Running Lights ───────────────────────────────────────
void e_running(Group& g, uint32_t t) {
  float phase = t * g.state.sx / 25000.0f;
  int   waves = max(1, g.state.ix/64) + 1;
  CRGB c = col0(g.state);
  for(int i=0;i<NUM_LEDS;i++) {
    float v = (sinf(i/(float)NUM_LEDS*6.2832f*waves - phase)+1.0f)*0.5f * g.state.bri/255.0f;
    g.leds[i] = CRGB((uint8_t)(c.r*v),(uint8_t)(c.g*v),(uint8_t)(c.b*v));
  }
}

// ── fx=17 Twinkle ──────────────────────────────────────────────
void e_twinkle(Group& g) {
  uint8_t fade  = max(1, 32 - g.state.sx/8);
  uint8_t spawn = max(1, g.state.ix/8);
  CRGB c = col0(g.state);
  for(int i=0;i<NUM_LEDS;i++) {
    if(g.tw[i]) g.tw[i]=qsub8(g.tw[i],fade); else if(random8()<spawn) g.tw[i]=255;
    float v = g.tw[i]/255.0f * g.state.bri/255.0f;
    g.leds[i] = CRGB((uint8_t)(c.r*v),(uint8_t)(c.g*v),(uint8_t)(c.b*v));
  }
}

// ── fx=18 Twinkle Random ───────────────────────────────────────
void e_twinkle_random(Group& g) {
  uint8_t fade  = max(1, 32 - g.state.sx/8);
  uint8_t spawn = max(1, g.state.ix/8);
  for(int i=0;i<NUM_LEDS;i++) {
    if(g.tw[i]) {
      g.tw[i]=qsub8(g.tw[i],fade);
      uint8_t h = (uint8_t)(i * 37);
      g.leds[i] = colorWheel(h);
      g.leds[i].nscale8(scale8(g.tw[i], g.state.bri));
    } else {
      if(random8()<spawn) { g.tw[i]=255; }
      else g.leds[i] = CRGB::Black;
    }
  }
}

// ── fx=19 Twinkle Fade ─────────────────────────────────────────
void e_twinkle_fade(Group& g) {
  uint8_t fade  = max(2, 40 - g.state.sx/7);
  uint8_t spawn = max(1, g.state.ix/10);
  CRGB c = col0(g.state); float br = g.state.bri/255.0f;
  fadeAll(g.leds, 255-fade);
  int cnt = max(1, NUM_LEDS * spawn / 128);
  for(int n=0; n<cnt; n++) {
    int i = random16(NUM_LEDS);
    CRGB col = c; col.nscale8((uint8_t)(br*255));
    g.leds[i] = col;
  }
}

// ── fx=21 Dissolve ─────────────────────────────────────────────
void e_dissolve(Group& g, uint32_t t) {
  uint8_t rate = max(1u, (uint32_t)g.state.sx*g.state.sx / 6400);
  // efxBuf[i]: 0=dark, 1=appearing, 2=lit, 3=fading
  CRGB c = colBr(g.state);
  for(int i=0;i<NUM_LEDS;i++) {
    if(g.efxBuf[i]==0) {
      if(random8() < rate) { g.efxBuf[i]=255; }
      g.leds[i] = CRGB::Black;
    } else {
      g.efxBuf[i] = qsub8(g.efxBuf[i], max(1,g.state.ix/16));
      if(g.efxBuf[i]==0) g.leds[i]=CRGB::Black;
      else { CRGB lc=c; lc.nscale8(g.efxBuf[i]); g.leds[i]=lc; }
    }
  }
}

// ── fx=25 Comet ────────────────────────────────────────────────
void e_comet(Group& g, uint32_t t) {
  float pos = fmodf(t * g.state.sx / 50000.0f, NUM_LEDS);
  CRGB c = col0(g.state); float br = g.state.bri/255.0f;
  int tail = max(3, g.state.ix/16);
  for(int i=0;i<NUM_LEDS;i++) {
    float d = fabsf(i-pos);
    if(d > NUM_LEDS/2) d = NUM_LEDS-d;
    float v = max(0.0f, 1.0f - d/tail) * br;
    g.leds[i] = CRGB((uint8_t)(c.r*v),(uint8_t)(c.g*v),(uint8_t)(c.b*v));
  }
}

// ── fx=28 Chase Rainbow ────────────────────────────────────────
void e_chase_rainbow(Group& g, uint32_t t) {
  int     pos = (int)(t * g.state.sx / 3000.0f) % NUM_LEDS;
  uint8_t hue = (uint8_t)((t * g.state.sx) >> 10);
  fillSolid(g.leds, CRGB::Black);
  for(int j=0;j<4;j++) {
    int  idx = ((pos-j)+NUM_LEDS*10) % NUM_LEDS;
    CRGB c   = colorWheel((hue+j*8)&0xFF);
    c.nscale8(scale8(g.state.bri, 255-j*55));
    g.leds[idx] = c;
  }
}

// ── fx=35 Colorful ─────────────────────────────────────────────
// Randomly colored segments, shifts over time
void e_colorful(Group& g, uint32_t t) {
  int segLen = max(2, NUM_LEDS / max(2, (int)(g.state.ix/40)+2));
  uint8_t phase = (uint8_t)(t * g.state.sx / 8000);
  for(int i=0;i<NUM_LEDS;i++) {
    uint8_t seg = (uint8_t)(i/segLen + phase);
    CRGB c = colorWheel(seg*37); c.nscale8(g.state.bri);
    g.leds[i] = c;
  }
}

// ── fx=38 Juggle ───────────────────────────────────────────────
// Colored dots bouncing with a beat (direct FX.cpp port)
void e_juggle(Group& g, uint32_t t) {
  fadeAll(g.leds, 224);
  uint8_t numdots = max(2, g.state.ix/32);
  for(uint8_t i=0;i<numdots;i++) {
    uint8_t pos = beatsin8_(i * (g.state.sx/16 + 1) + 1, 0, NUM_LEDS-1, t, i*2048/numdots);
    g.leds[pos] |= colorWheel((i*255/numdots + (t>>6)) & 0xFF);
    g.leds[pos].nscale8(g.state.bri);
  }
}

// ── fx=40 Sparkle ──────────────────────────────────────────────
void e_sparkle(Group& g) {
  fillSolid(g.leds, colBr(g.state));
  int cnt = max(1, g.state.ix/64);
  for(int i=0;i<cnt;i++) g.leds[random16(NUM_LEDS)] = CRGB::White;
}

// ── fx=41 Sparkle Dark ─────────────────────────────────────────
void e_sparkle_dark(Group& g) {
  fillSolid(g.leds, CRGB::Black);
  int cnt = max(1, g.state.ix/40);
  for(int i=0;i<cnt;i++) {
    CRGB c = colBr(g.state);
    g.leds[random16(NUM_LEDS)] = c;
  }
}

// ── fx=42 Fireworks ────────────────────────────────────────────
void e_fireworks(Group& g) {
  static const CRGB pal[] = {CRGB::Red,CRGB::OrangeRed,CRGB::Yellow,CRGB::Green,
                               CRGB::Cyan,CRGB::Blue,CRGB::Magenta,CRGB::White};
  fadeAll(g.leds, max(4, 28-g.state.ix/10));
  if(random8() < g.state.sx/5) {
    int center = random16(NUM_LEDS);
    CRGB c = pal[random8(8)]; c.nscale8(g.state.bri);
    int spread = max(2, g.state.ix/25);
    for(int j=-spread;j<=spread;j++) {
      int idx = constrain(center+j, 0, NUM_LEDS-1);
      float v = max(0.0f, 1.0f - fabsf(j)/(float)(spread+1));
      g.leds[idx].r = qadd8(g.leds[idx].r,(uint8_t)(c.r*v));
      g.leds[idx].g = qadd8(g.leds[idx].g,(uint8_t)(c.g*v));
      g.leds[idx].b = qadd8(g.leds[idx].b,(uint8_t)(c.b*v));
    }
  }
}

// ── fx=44 Fireworks 1D (physics) ───────────────────────────────
void e_fireworks1d(Group& g) {
  static const CRGB fw1pal[] = {
    CRGB(255,30,0),CRGB(255,130,0),CRGB(255,230,0),CRGB(80,255,0),
    CRGB(0,180,255),CRGB(160,0,255),CRGB(255,0,150),CRGB(0,255,160)
  };
  const int GRAV=60; float br=g.state.bri/255.0f;
  for(int i=0;i<NUM_LEDS;i++) { g.leds[i].r=qsub8(g.leds[i].r,55); g.leds[i].g=qsub8(g.leds[i].g,55); g.leds[i].b=qsub8(g.leds[i].b,55); }
  if(random8()<12+(g.state.sx>>3) && g.fw.size()<30) {
    int h=random(NUM_LEDS/3, max(NUM_LEDS/3+1, NUM_LEDS-2));
    int v0=(int)sqrtf(2.0f*GRAV*100.0f*h);
    CRGB c=fw1pal[random8(8)];
    g.fw.push_back({0,v0,255,c.r,c.g,c.b,false});
  }
  std::vector<Group::Particle> nxt;
  for(auto& p : g.fw) {
    p.vel-=GRAV; p.pos+=p.vel; p.life-=p.isSpark?18:15;
    if(!p.isSpark && p.vel<=0) {
      int nsp=8+(g.state.ix>>4), spd=80+(g.state.ix>>1);
      for(int i=0;i<nsp;i++) nxt.push_back({p.pos,random(-spd,spd),230,p.r,p.g,p.b,true});
      continue;
    }
    if(p.life>0 && p.pos>=-300 && p.pos<=NUM_LEDS*100+300) nxt.push_back(p);
  }
  if(nxt.size()>40) nxt.erase(nxt.begin(), nxt.begin()+(nxt.size()-40));
  g.fw=nxt;
  for(auto& p : g.fw) {
    int idx=p.pos/100;
    if(idx>=0 && idx<NUM_LEDS) {
      float v=p.life/255.0f*br;
      g.leds[idx].r=qadd8(g.leds[idx].r,(uint8_t)(p.r*v));
      g.leds[idx].g=qadd8(g.leds[idx].g,(uint8_t)(p.g*v));
      g.leds[idx].b=qadd8(g.leds[idx].b,(uint8_t)(p.b*v));
    }
  }
}

// ── fx=45 Rain ─────────────────────────────────────────────────
void e_rain(Group& g) {
  // efxBuf[i] = drop brightness, fades over time, new drops appear at top
  uint8_t spawnRate = max(1, g.state.sx/16);
  uint8_t fadeRate  = max(2, 30-g.state.ix/10);
  CRGB c = col0(g.state);
  // Shift all drops down by 1
  for(int i=0;i<NUM_LEDS-1;i++) g.efxBuf[i]=qsub8(g.efxBuf[i+1],1);
  g.efxBuf[NUM_LEDS-1]=0;
  // Spawn new drops at top
  if(random8()<spawnRate) g.efxBuf[NUM_LEDS-1]=random8(180,255);
  // Render
  for(int i=0;i<NUM_LEDS;i++) {
    float v=g.efxBuf[i]/255.0f * g.state.bri/255.0f;
    g.leds[i]=CRGB((uint8_t)(c.r*v),(uint8_t)(c.g*v),(uint8_t)(c.b*v));
  }
}

// ── fx=53 Bouncing Balls ───────────────────────────────────────
void e_balls(Group& g, uint32_t t) {
  static const float GRAVITY = -9.81f * 0.5f;
  uint8_t numBalls = min(8, max(1, g.state.ix/32));
  if(!g.ballsInit) {
    for(int i=0;i<8;i++) {
      g.balls[i].pos    = NUM_LEDS-1;
      g.balls[i].vel    = -sqrtf(-2.0f*GRAVITY*(float)(NUM_LEDS/3 + i*(NUM_LEDS/8)));
      g.balls[i].colIdx = (uint8_t)(i*255/8);
      g.balls[i].active = true;
    }
    g.ballsInit=true;
  }
  float dt = 1.0f/FPS;
  fillSolid(g.leds, CRGB::Black);
  for(int i=0;i<numBalls;i++) {
    auto& b=g.balls[i];
    b.vel += GRAVITY * dt;
    b.pos += b.vel * dt;
    if(b.pos <= 0.0f) {
      b.pos=0.0f;
      b.vel = fabsf(b.vel) * 0.88f; // dampening
      if(b.vel < 0.5f) { b.vel = -sqrtf(-2.0f*GRAVITY*(float)(NUM_LEDS/3)); } // re-launch
    }
    int idx = constrain((int)b.pos, 0, NUM_LEDS-1);
    CRGB c = colorWheel(b.colIdx); c.nscale8(g.state.bri);
    g.leds[idx] = c;
    // soft glow on adjacent
    if(idx>0)           { CRGB gc=c; gc.nscale8(100); g.leds[idx-1]|=gc; }
    if(idx<NUM_LEDS-1)  { CRGB gc=c; gc.nscale8(100); g.leds[idx+1]|=gc; }
  }
}

// ── fx=57 Lightning ────────────────────────────────────────────
void e_lightning(Group& g, uint32_t t) {
  if(t >= g.ltgNext) {
    g.ltgStart  = random16(NUM_LEDS);
    g.ltgLen    = random8(2, max(3, NUM_LEDS/4));
    g.ltgFlash  = 6 + random8(4);  // number of flickers
    g.ltgNext   = t + 500 + random(1000 - g.state.sx*3);
  }
  fillSolid(g.leds, CRGB::Black);
  if(g.ltgFlash > 0) {
    bool lit = (g.ltgFlash % 2)==0;
    if(lit) {
      CRGB c = CRGB(200,200,255); c.nscale8(g.state.bri);
      int end = min(NUM_LEDS-1, g.ltgStart+g.ltgLen);
      for(int i=g.ltgStart;i<=end;i++) g.leds[i]=c;
    }
    g.ltgFlash = qsub8(g.ltgFlash, 1+(g.state.sx>>6));
  }
}

// ── fx=66 Fire2012 ─────────────────────────────────────────────
void e_fire(Group& g) {
  int     co      = (11*(255-min(255,(int)g.state.sx)))>>4;
  int     coolMax = co*10/NUM_LEDS + 2;
  uint8_t sk      = (g.state.ix>>1)+64;
  for(int i=0;i<NUM_LEDS;i++)   g.heat[i]=(uint8_t)max(0,(int)g.heat[i]-(int)random(0,coolMax));
  for(int i=NUM_LEDS-1;i>1;i--) g.heat[i]=(g.heat[i-1]+g.heat[i-2]+g.heat[i-2])/3;
  if(random8()<sk) { int j=random(0,min(6,NUM_LEDS-1)); g.heat[j]=qadd8(g.heat[j],random(160,255)); }
  float br=g.state.bri/255.0f;
  for(int i=0;i<NUM_LEDS;i++) {
    uint8_t h=g.heat[i]; uint8_t t192=(uint16_t)h*191>>8; uint8_t hr=(t192&0x3F)<<2;
    uint8_t rv,gv,bv;
    if(t192&0x80){rv=255;gv=255;bv=hr;} else if(t192&0x40){rv=255;gv=hr;bv=0;} else{rv=hr;gv=0;bv=0;}
    g.leds[NUM_LEDS-1-i]=CRGB((uint8_t)(rv*br),(uint8_t)(gv*br),(uint8_t)(bv*br));
  }
}

// ── fx=67 Fire Flicker ─────────────────────────────────────────
void e_fire_flicker(Group& g) {
  CRGB c = col0(g.state);
  uint8_t flickDepth = max(10, 255 - g.state.ix);
  for(int i=0;i<NUM_LEDS;i++) {
    uint8_t flicker = random8(flickDepth);
    CRGB fc = c; fc.nscale8(qsub8(g.state.bri, flicker));
    g.leds[i] = fc;
  }
}

// ── fx=68 Gradient ─────────────────────────────────────────────
void e_gradient(Group& g, uint32_t t) {
  uint8_t phase = (uint8_t)(t * g.state.sx / 6000);
  for(int i=0;i<NUM_LEDS;i++) {
    uint8_t pos = (uint8_t)(i*256/NUM_LEDS + phase);
    CRGB c = colorWheel(pos); c.nscale8(g.state.bri);
    g.leds[i] = c;
  }
}

// ── fx=76 Meteor ───────────────────────────────────────────────
void e_meteor(Group& g, uint32_t t) {
  int pos = (int)(t * g.state.sx / 3000.0f) % NUM_LEDS;
  int tr  = max(2, g.state.ix/8);
  CRGB c  = col0(g.state); float br=g.state.bri/255.0f;
  for(int i=0;i<NUM_LEDS;i++) {
    g.leds[i].r=qsub8(g.leds[i].r,20); g.leds[i].g=qsub8(g.leds[i].g,20); g.leds[i].b=qsub8(g.leds[i].b,20);
  }
  for(int j=0;j<tr;j++) {
    int idx=((pos-j)+NUM_LEDS*100)%NUM_LEDS;
    float v=(1.0f-(float)j/tr)*br;
    g.leds[idx]=CRGB((uint8_t)(c.r*v),(uint8_t)(c.g*v),(uint8_t)(c.b*v));
  }
}



// ── fx=79 Ripple ───────────────────────────────────────────────
void e_ripple(Group& g, uint32_t t) {
  uint8_t maxAge = max(40u, (uint32_t)255 - g.state.sx);
  fadeAll(g.leds, 220);
  if(g.ripAge >= maxAge) {
    g.ripCenter = random16(NUM_LEDS);
    g.ripAge    = 0;
  }
  CRGB c = col0(g.state);
  float v = (1.0f - g.ripAge/(float)maxAge) * g.state.bri/255.0f;
  int spread = g.ripAge * NUM_LEDS / (maxAge * 2);
  for(int side=-1;side<=1;side+=2) {
    int idx = g.ripCenter + side * spread;
    if(idx>=0 && idx<NUM_LEDS) {
      g.leds[idx].r=qadd8(g.leds[idx].r,(uint8_t)(c.r*v));
      g.leds[idx].g=qadd8(g.leds[idx].g,(uint8_t)(c.g*v));
      g.leds[idx].b=qadd8(g.leds[idx].b,(uint8_t)(c.b*v));
    }
  }
  g.ripAge++;
}

// ── fx=88 Colorwaves ───────────────────────────────────────────
// Lush, beautiful color waves. Direct port from WLED/FastLED.
void e_colorwaves(Group& g, uint32_t t) {
  static const TProgmemRGBPalette16 p PROGMEM = {
    0x000507,0x000409,0x00030B,0x00030D,0x000210,0x000212,0x000114,0x000117,
    0x000019,0x00001C,0x000026,0x000031,0x00003B,0x000046,0x14554B,0x28AA50
  };
  uint16_t speed16 = g.state.sx * 256;
  uint32_t sHue16  = (uint32_t)speed16 * t / 1000;
  uint16_t sPseudoTime = (uint16_t)(t * ((uint16_t)g.state.sx+20) / 20);
  uint16_t sLastMillis = 0;
  for(int i=0;i<NUM_LEDS;i++) {
    uint16_t  iHue16    = sHue16 + (uint16_t)(g.state.ix * i / NUM_LEDS * 256);
    uint8_t   iHue8     = iHue16 >> 8;
    uint8_t   msmix     = iHue16 & 0xFF;
    uint8_t   brValue   = scale8(cubicwave8(iHue8), g.state.bri);
    bool      bLow      = (uint8_t)(iHue8)   < 86;
    CRGB      c         = ColorFromPalette((CRGBPalette16)p, iHue8, brValue);
    g.leds[i] = c;
  }
}

// ── fx=90 BPM ──────────────────────────────────────────────────
// Colored stripes pulsing at a defined BPM (direct port from FastLED demo)
void e_bpm(Group& g, uint32_t t) {
  CRGBPalette16 pal = PartyColors_p;
  uint8_t bpm8  = g.state.sx/4 + 10;
  uint8_t beat  = beatsin8_(bpm8, 64, 255, t);
  for(int i=0;i<NUM_LEDS;i++) {
    CRGB c = ColorFromPalette(pal, (uint8_t)(t>>4) + i*2, beat - (uint8_t)(i*10), LINEARBLEND);
    c.nscale8(g.state.bri);
    g.leds[i] = c;
  }
}

// ── fx=91 Fill Noise8 ──────────────────────────────────────────
void e_fill_noise(Group& g, uint32_t t) {
  uint8_t octaves = max(1, g.state.ix/64) + 1;
  uint16_t x = (uint16_t)(t * g.state.sx / 200);
  for(int i=0;i<NUM_LEDS;i++) {
    uint8_t noise = inoise8(x + i*16, t>>2);
    CRGB c = ColorFromPalette(OceanColors_p, noise, g.state.bri);
    g.leds[i] = c;
  }
}

// ── fx=98 Juggle ───────────────────────────────────────────────
// (alias of e_juggle, different id used in some WLED versions)

// ── fx=112 Heartbeat ───────────────────────────────────────────
void e_heartbeat(Group& g, uint32_t t) {
  uint32_t bpm = 40 + (uint32_t)g.state.sx * 100 / 255;
  uint32_t beat = (t * bpm / 60000) % 1;
  uint32_t phase = t * bpm % 60000;
  // Two-pulse heartbeat (lub-dub)
  float p1 = expf(-((float)((phase) % 60000) / 1000.0f - 0.2f) * ((float)((phase) % 60000) / 1000.0f - 0.2f) * 60.0f);
  float p2 = expf(-((float)((phase) % 60000) / 1000.0f - 0.5f) * ((float)((phase) % 60000) / 1000.0f - 0.5f) * 80.0f);
  float pulse = max(p1, p2 * 0.6f);
  CRGB c = col0(g.state); c.nscale8((uint8_t)(pulse * g.state.bri));
  fillSolid(g.leds, c);
}

// ── fx=116 Candle ──────────────────────────────────────────────
void e_candle(Group& g) {
  // Warm candle-like flickering with spatial variation
  for(int i=0;i<NUM_LEDS;i++) {
    uint8_t flicker  = random8(80);
    uint8_t base     = qsub8(g.state.bri, flicker);
    // Warm orange-yellow palette
    uint8_t heatIdx  = base;
    uint8_t r = qadd8(heatIdx, 40);
    uint8_t gv = scale8(heatIdx, 60);
    uint8_t b  = 0;
    g.leds[i] = CRGB(r, gv, b);
  }
  // Blend adjacent pixels for smooth look
  for(int i=1;i<NUM_LEDS-1;i++) {
    g.leds[i].r = (g.leds[i-1].r/4 + g.leds[i].r/2 + g.leds[i+1].r/4);
    g.leds[i].g = (g.leds[i-1].g/4 + g.leds[i].g/2 + g.leds[i+1].g/4);
  }
}

// ── fx=117 Starburst ───────────────────────────────────────────
void e_starburst(Group& g, uint32_t t) {
  fadeAll(g.leds, 200);
  uint32_t now = t;
  if(now >= g.burstNext) {
    g.burstNext = now + max(200u, (uint32_t)(600 - g.state.sx*2));
    uint8_t  hue    = random8();
    int      center = random16(NUM_LEDS);
    int      nsp    = max(4, g.state.ix/16);
    for(int i=0;i<nsp;i++) {
      float v = random(10,50) / 10.0f * (random8(2)?1:-1);
      g.sparks.push_back({(float)center, v, hue, 255});
    }
  }
  std::vector<Group::Spark> alive;
  for(auto& sp : g.sparks) {
    sp.pos  += sp.vel;
    sp.vel  *= 0.93f;
    sp.life  = qsub8(sp.life, 12);
    if(sp.life > 0 && sp.pos>=0 && sp.pos<NUM_LEDS) {
      int idx = (int)sp.pos;
      CRGB c = colorWheel(sp.hue); c.nscale8(scale8(sp.life, g.state.bri));
      g.leds[idx] |= c;
      alive.push_back(sp);
    }
  }
  g.sparks = alive;
}

// ── fx=126 Pacifica ────────────────────────────────────────────
// Beautiful gentle ocean waves. Port of Mark Kriegsman's Pacifica for FastLED.
// Three overlapping wave palettes, plus a whitecap layer and a deep water layer.
static void pacifica_one_layer(CRGB* leds, CRGBPalette16& p,
                                uint16_t ciStart, uint16_t waveScale,
                                uint8_t bri, uint16_t iOff) {
  uint16_t ci = ciStart;
  for(int i=0; i<NUM_LEDS; i++) {
    ci  += waveScale;
    int  sIndex16  = sin16(ci) + 32768;
    uint8_t sIndex = scale16(sIndex16, 240);
    CRGB c = ColorFromPalette(p, sIndex, bri, LINEARBLEND);
    leds[i] += c;
  }
}
static void pacifica_add_whitecaps(CRGB* leds, uint16_t baseThreshold, uint8_t bri16) {
  for(int i=0;i<NUM_LEDS;i++) {
    uint16_t overage = qadd8(leds[i].r, qadd8(leds[i].g, leds[i].b));
    if(overage > baseThreshold) {
      uint8_t white = scale8(overage - baseThreshold, bri16);
      leds[i] += CRGB(white,white,white);
    }
  }
}

void e_pacifica(Group& g, uint32_t t) {
  // Three separate palettes
  static CRGBPalette16 pal1 = {
    0x000507,0x000409,0x00030B,0x00030D,0x000210,0x000212,0x000114,0x000117,
    0x000019,0x00001C,0x000026,0x000031,0x00003B,0x000046,0x14554B,0x28AA50};
  static CRGBPalette16 pal2 = {
    0x000507,0x000409,0x00030B,0x00030D,0x000210,0x000212,0x000114,0x000117,
    0x000019,0x00001C,0x000026,0x000031,0x00003B,0x000046,0x0C5F52,0x1C9960};
  static CRGBPalette16 pal3 = {
    0x000208,0x00030E,0x000514,0x00061A,0x000820,0x000927,0x000B2D,0x000C33,
    0x000E39,0x001040,0x001450,0x001860,0x001C70,0x002080,0x1040BF,0x2060FF};

  uint32_t speedFactor = 1 + g.state.sx/32;
  uint16_t speedA = (uint16_t)(t * speedFactor) >> 3;
  uint16_t speedB = (uint16_t)(t * speedFactor) >> 4;

  fillSolid(g.leds, CRGB(2,6,10)); // deep water base

  uint8_t basebright = g.state.bri;
  pacifica_one_layer(g.leds, pal1, speedA,  11*256/NUM_LEDS, scale8(basebright,170), 0);
  pacifica_one_layer(g.leds, pal2, speedB,   7*256/NUM_LEDS, scale8(basebright,160), 16);
  pacifica_one_layer(g.leds, pal1, (uint16_t)(t * speedFactor)>>5, 5*256/NUM_LEDS, scale8(basebright,130), 8);
  pacifica_one_layer(g.leds, pal3, (uint16_t)(t * speedFactor)>>6, 16*256/NUM_LEDS, scale8(basebright,120), 0);
  pacifica_add_whitecaps(g.leds, basebright*3/4, scale8(basebright,50));
  // Dim to brightness
  for(int i=0;i<NUM_LEDS;i++) g.leds[i].nscale8(basebright);
}

// ── fx=100 Sunrise / Sunset ────────────────────────────────────
void e_sunrise(Group& g, uint32_t t) {
  // Simulates sunrise: black → deep red → orange → warm yellow → white
  uint32_t cycle = max(10000u, (uint32_t)(60000 - g.state.sx*230));
  float    phase = fmodf((float)t / cycle, 1.0f);
  uint8_t  pos   = (uint8_t)(phase * 255);
  // Palette: night→dawn→morning
  static const CRGBPalette16 sunPal = {
    CRGB::Black, CRGB(10,0,0), CRGB(40,5,0), CRGB(80,15,0),
    CRGB(150,30,0), CRGB(200,70,0), CRGB(255,120,0), CRGB(255,160,20),
    CRGB(255,190,60), CRGB(255,210,100), CRGB(255,230,150), CRGB(255,245,200),
    CRGB(255,250,220), CRGB::White, CRGB::White, CRGB::White
  };
  for(int i=0;i<NUM_LEDS;i++) {
    CRGB c = ColorFromPalette(sunPal, pos, g.state.bri, LINEARBLEND);
    g.leds[i] = c;
  }
}

// ── fx=109 Twinklefox ──────────────────────────────────────────
// Beautiful, natural-looking twinkle. Direct port from Mark Kriegsman.
static uint8_t attackDecayWave8(uint8_t i) {
  if(i < 86) return i * 3;
  else { i -= 86; return 255 - (i + (i>>1)); }
}
static void drawTwinkleFox(CRGB* leds, uint16_t* pixelClock, uint32_t t,
                            uint8_t bri, uint8_t speed, CRGBPalette16& pal) {
  uint16_t PRNG16 = 2048;
  uint32_t clock32  = t * (speed/8 + 1);
  uint8_t  fastcycle8 = clock32 >> 8;
  for(int i=0; i<NUM_LEDS; i++) {
    PRNG16 = (uint16_t)(PRNG16 * 2053) + 1384;
    uint16_t myOffset = (PRNG16 >> 8) + (~PRNG16 & 0x00FF);
    uint32_t  myTime  = clock32 + myOffset;
    uint8_t myTri     = triwave8((uint8_t)(myTime >> 4));
    uint8_t myBright  = attackDecayWave8(myTri);
    uint8_t hue8      = PRNG16 >> 8;
    CRGB c = ColorFromPalette(pal, hue8, scale8(myBright, bri), LINEARBLEND);
    leds[i] = c;
  }
}
void e_twinklefox(Group& g, uint32_t t) {
  CRGBPalette16 pal = RainbowColors_p;
  drawTwinkleFox(g.leds, g.pixelState, t, g.state.bri, g.state.sx, pal);
}
void e_twinklefox_party(Group& g, uint32_t t) {
  CRGBPalette16 pal = PartyColors_p;
  drawTwinkleFox(g.leds, g.pixelState, t, g.state.bri, g.state.sx, pal);
}

// ── fx=65 Halloween Eyes ───────────────────────────────────────
void e_halloween_eyes(Group& g, uint32_t t) {
  fillSolid(g.leds, CRGB::Black);
  uint32_t eyePhase = t * g.state.sx / 5000;
  bool blink = ((eyePhase / 8) % 16 == 0); // occasional blink
  if(!blink) {
    int eyePos = (int)(beatsin8_(20, 1, NUM_LEDS/2-2, t));
    CRGB c = col0(g.state); c.nscale8(g.state.bri);
    g.leds[eyePos]             = c;
    g.leds[eyePos+1]           = c;
    g.leds[NUM_LEDS-2-eyePos]  = c;
    g.leds[NUM_LEDS-1-eyePos]  = c;
    // Subtle glow
    CRGB dim=c; dim.nscale8(60);
    if(eyePos>0)           g.leds[eyePos-1]=dim;
    if(eyePos+2<NUM_LEDS)  g.leds[eyePos+2]=dim;
  }
}

// ═══════════════════════════════════════════════════════════════
//  DISPATCH
// ═══════════════════════════════════════════════════════════════
void renderGroup(Group& g, uint32_t t) {
  if(!g.state.on) { fillSolid(g.leds, CRGB::Black); return; }
  switch(g.state.fx) {
    case   1: e_blink(g,t);            break;
    case   2: e_breathe(g,t);          break;
    case   3: e_wipe(g,t);             break;
    case   4: e_wipe_random(g,t);      break;
    case   5: e_wipe_rev(g,t);         break;
    case   8: e_colorloop(g,t);        break;
    case   9: e_rainbow(g,t);          break;
    case  10: e_fade(g,t);             break;
    case  11: e_scanner(g,t);          break;
    case  12: e_strobe(g,t);           break;
    case  13: e_strobe_rainbow(g,t);   break;
    case  16: e_running(g,t);          break;
    case  17: e_twinkle(g);            break;
    case  18: e_twinkle_random(g);     break;
    case  19: e_twinkle_fade(g);       break;
    case  21: e_dissolve(g,t);         break;
    case  25: e_comet(g,t);            break;
    case  28: e_chase_rainbow(g,t);    break;
    case  35: e_colorful(g,t);         break;
    case  38: e_juggle(g,t);           break;
    case  40: e_sparkle(g);            break;
    case  41: e_sparkle_dark(g);       break;
    case  42: e_fireworks(g);          break;
    case  44: e_fireworks1d(g);        break;
    case  45: e_rain(g);               break;
    case  51: e_scanner_dual(g,t);     break;
    case  53: e_balls(g,t);            break;
    case  57: e_lightning(g,t);        break;
    case  65: e_halloween_eyes(g,t);   break;
    case  66: e_fire(g);               break;
    case  67: e_fire_flicker(g);       break;
    case  68: e_gradient(g,t);         break;
    case  76: e_meteor(g,t);           break;
    case  79: e_ripple(g,t);           break;
    case  88: e_colorwaves(g,t);       break;
    case  90: e_bpm(g,t);              break;
    case  91: e_fill_noise(g,t);       break;
    case 100: e_sunrise(g,t);          break;
    case 109: e_twinklefox(g,t);       break;
    case 110: e_twinklefox_party(g,t); break;
    case 112: e_heartbeat(g,t);        break;
    case 116: e_candle(g);             break;
    case 117: e_starburst(g,t);        break;
    case 126: e_pacifica(g,t);         break;
    default:  e_solid(g);              break;
  }
}
