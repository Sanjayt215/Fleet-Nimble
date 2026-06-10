import 'package:flutter/material.dart';
import 'dart:math' as math;

class RpmGauge extends StatelessWidget {
  final double? value;
  final double max;

  const RpmGauge({super.key, this.value, this.max = 8000});

  @override
  Widget build(BuildContext context) {
    final v = (value ?? 0).clamp(0, max);
    final pct = v / max;
    return CustomPaint(
      size: const Size(100, 100),
      painter: _GaugePainter(pct, '${v.toInt()}', 'RPM', Colors.blue),
    );
  }
}

class _GaugePainter extends CustomPainter {
  final double pct;
  final String value;
  final String label;
  final Color color;

  _GaugePainter(this.pct, this.value, this.label, this.color);

  @override
  void paint(Canvas canvas, Size size) {
    final center = Offset(size.width / 2, size.height / 2);
    final radius = size.width / 2 - 8;
    final bg = Paint()
      ..color = Colors.grey.shade300
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8;
    final fg = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 8
      ..strokeCap = StrokeCap.round;

    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      math.pi * 0.75,
      math.pi * 1.5,
      false,
      bg,
    );
    canvas.drawArc(
      Rect.fromCircle(center: center, radius: radius),
      math.pi * 0.75,
      math.pi * 1.5 * pct,
      false,
      fg,
    );

    final tp = TextPainter(
      text: TextSpan(
        text: value,
        style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
    tp.paint(canvas, center - Offset(tp.width / 2, tp.height / 2 + 4));

    final lp = TextPainter(
      text: TextSpan(text: label, style: TextStyle(fontSize: 10, color: Colors.grey.shade600)),
      textDirection: TextDirection.ltr,
    )..layout();
    lp.paint(canvas, center - Offset(lp.width / 2, tp.height / 2 + 14));
  }

  @override
  bool shouldRepaint(covariant _GaugePainter old) => old.pct != pct;
}
