import 'package:flutter/material.dart';
import '../providers/analysis_provider.dart';
import '../theme/app_theme.dart';

// Icon and title per error kind
const _kindMeta = {
  ApiErrorKind.validation: (
    icon: Icons.rule_rounded,
    title: 'Invalid Input',
    color: AppColors.warning,
  ),
  ApiErrorKind.auth: (
    icon: Icons.lock_outline_rounded,
    title: 'Authentication Error',
    color: AppColors.danger,
  ),
  ApiErrorKind.notFound: (
    icon: Icons.search_off_rounded,
    title: 'PR Not Found',
    color: AppColors.warning,
  ),
  ApiErrorKind.timeout: (
    icon: Icons.timer_off_outlined,
    title: 'Request Timed Out',
    color: AppColors.warning,
  ),
  ApiErrorKind.noConnection: (
    icon: Icons.cloud_off_outlined,
    title: 'Cannot Reach Server',
    color: AppColors.danger,
  ),
  ApiErrorKind.server: (
    icon: Icons.error_outline_rounded,
    title: 'Server Error',
    color: AppColors.danger,
  ),
};

/// Shows a styled error dialog.
///
/// Call [ErrorDialog.show] — it handles [provider.consumeError()] automatically.
class ErrorDialog extends StatelessWidget {
  final ApiException error;

  const ErrorDialog({super.key, required this.error});

  /// Convenience static method — shows the dialog and consumes the error.
  static Future<void> show(
    BuildContext context,
    AnalysisProvider provider,
  ) async {
    if (!provider.hasUnseenError || provider.error == null) return;
    final error = provider.error!;
    provider.consumeError();

    await showDialog<void>(
      context: context,
      barrierColor: Colors.black54,
      builder: (_) => ErrorDialog(error: error),
    );
  }

  @override
  Widget build(BuildContext context) {
    final meta = _kindMeta[error.kind] ??
        (
          icon: Icons.error_outline_rounded,
          title: 'Error',
          color: AppColors.danger,
        );

    return Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: meta.color.withValues(alpha: 0.3)),
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 440),
        child: Padding(
          padding: const EdgeInsets.all(28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Icon + title row
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: meta.color.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Icon(meta.icon, color: meta.color, size: 20),
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Text(
                      meta.title,
                      style: TextStyle(
                        color: meta.color,
                        fontSize: 16,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 20),

              // Message
              Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: AppColors.surfaceAlt,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: AppColors.border),
                ),
                child: Text(
                  error.message,
                  style: const TextStyle(
                    color: AppColors.textSecondary,
                    fontSize: 13,
                    height: 1.5,
                  ),
                ),
              ),

              // HTTP status hint
              if (error.statusCode != null) ...[
                const SizedBox(height: 8),
                Text(
                  'HTTP ${error.statusCode}',
                  style: const TextStyle(
                    color: AppColors.textMuted,
                    fontSize: 11,
                  ),
                ),
              ],

              const SizedBox(height: 24),

              // Dismiss button
              SizedBox(
                width: double.infinity,
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(),
                  style: TextButton.styleFrom(
                    backgroundColor: meta.color.withValues(alpha: 0.1),
                    foregroundColor: meta.color,
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8),
                    ),
                  ),
                  child: const Text('Dismiss',
                      style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
