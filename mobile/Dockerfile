# Flutter build pipeline (requires Flutter SDK in CI)
FROM ghcr.io/cirruslabs/flutter:stable AS build

WORKDIR /app
COPY pubspec.yaml ./
RUN flutter pub get
COPY . .
RUN flutter build apk --release

FROM alpine:3.19
COPY --from=build /app/build/app/outputs/flutter-apk/app-release.apk /fleet-mobile.apk
# Artifact only — install APK on device manually
