import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import '../theme/app_theme.dart';

class PrSearchBar extends StatefulWidget {
  final bool isLoading;
  final void Function(String url) onAnalyze;

  const PrSearchBar({
    super.key,
    required this.isLoading,
    required this.onAnalyze,
  });

  @override
  State<PrSearchBar> createState() => _PrSearchBarState();
}

class _PrSearchBarState extends State<PrSearchBar> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();
  String? _validationError;

  static final _prUrlPattern = RegExp(
    r'^https?://github\.com/[^/]+/[^/]+/pull/\d+',
  );

  void _submit() {
    final url = _controller.text.trim();
    if (url.isEmpty) {
      setState(() => _validationError = 'Enter a GitHub PR URL');
      return;
    }
    if (!_prUrlPattern.hasMatch(url)) {
      setState(() => _validationError =
          'Must be: https://github.com/owner/repo/pull/123');
      return;
    }
    setState(() => _validationError = null);
    widget.onAnalyze(url);
  }

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: TextField(
                controller: _controller,
                focusNode: _focusNode,
                enabled: !widget.isLoading,
                style: const TextStyle(
                  color: AppColors.textPrimary,
                  fontSize: 14,
                ),
                decoration: InputDecoration(
                  hintText: 'https://github.com/owner/repo/pull/123',
                  prefixIcon: const Icon(
                    Icons.link_rounded,
                    color: AppColors.textMuted,
                    size: 18,
                  ),
                  errorText: _validationError,
                  suffixIcon: _controller.text.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.clear,
                              color: AppColors.textMuted, size: 16),
                          onPressed: () {
                            _controller.clear();
                            setState(() => _validationError = null);
                          },
                        )
                      : null,
                ),
                onChanged: (_) {
                  setState(() => _validationError = null);
                },
                onSubmitted: (_) => _submit(),
              ),
            ),
            const SizedBox(width: 12),
            _AnalyzeButton(
              isLoading: widget.isLoading,
              onPressed: widget.isLoading ? null : _submit,
            ),
          ],
        ),
      ],
    ).animate().fadeIn(duration: 400.ms);
  }
}

class _AnalyzeButton extends StatelessWidget {
  final bool isLoading;
  final VoidCallback? onPressed;

  const _AnalyzeButton({required this.isLoading, required this.onPressed});

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 48,
      child: ElevatedButton(
        onPressed: onPressed,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.accent,
          foregroundColor: AppColors.background,
          padding: const EdgeInsets.symmetric(horizontal: 24),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(10),
          ),
          elevation: 0,
        ),
        child: isLoading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  valueColor: AlwaysStoppedAnimation(AppColors.background),
                ),
              )
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: const [
                  Icon(Icons.search_rounded, size: 16),
                  SizedBox(width: 8),
                  Text(
                    'Analyze PR',
                    style: TextStyle(
                      fontWeight: FontWeight.w600,
                      fontSize: 14,
                    ),
                  ),
                ],
              ),
      ),
    );
  }
}
