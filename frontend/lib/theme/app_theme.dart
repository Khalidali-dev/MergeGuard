import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

// ── Palette ──────────────────────────────────────────────────────────────────
class AppColors {
  AppColors._();

  static const background = Color(0xFF0D1117);   // GitHub-dark bg
  static const surface    = Color(0xFF161B22);   // card surface
  static const surfaceAlt = Color(0xFF1C2128);   // slightly lighter
  static const border     = Color(0xFF30363D);   // subtle borders
  static const textPrimary   = Color(0xFFE6EDF3);
  static const textSecondary = Color(0xFF8B949E);
  static const textMuted     = Color(0xFF484F58);

  static const accent   = Color(0xFF58A6FF);     // blue accent
  static const success  = Color(0xFF3FB950);     // green
  static const warning  = Color(0xFFD29922);     // yellow/amber
  static const danger   = Color(0xFFF85149);     // red
  static const info     = Color(0xFF79C0FF);     // light blue

  // Severity colours
  static const critical = Color(0xFFF85149);
  static const high     = Color(0xFFFF7B72);
  static const medium   = Color(0xFFD29922);
  static const low      = Color(0xFF3FB950);
}

// ── Theme ─────────────────────────────────────────────────────────────────────
ThemeData buildAppTheme() {
  final base = ThemeData.dark(useMaterial3: true);
  final textTheme = GoogleFonts.interTextTheme(base.textTheme).apply(
    bodyColor: AppColors.textPrimary,
    displayColor: AppColors.textPrimary,
  );

  return base.copyWith(
    scaffoldBackgroundColor: AppColors.background,
    colorScheme: const ColorScheme.dark(
      surface: AppColors.surface,
      primary: AppColors.accent,
      secondary: AppColors.success,
      error: AppColors.danger,
    ),
    textTheme: textTheme,
    cardTheme: CardThemeData(
      color: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: AppColors.border, width: 1),
      ),
      elevation: 0,
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceAlt,
      hintStyle: GoogleFonts.inter(color: AppColors.textMuted, fontSize: 14),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.accent, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(10),
        borderSide: const BorderSide(color: AppColors.danger),
      ),
    ),
    dividerColor: AppColors.border,
    dividerTheme: const DividerThemeData(color: AppColors.border, space: 1),
  );
}

// ── Typography helpers ────────────────────────────────────────────────────────
TextStyle monoStyle({double size = 12, Color color = AppColors.textSecondary}) =>
    GoogleFonts.jetBrainsMono(fontSize: size, color: color, height: 1.5);
