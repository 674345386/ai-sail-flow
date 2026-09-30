import AppKit
import Vision
import CoreImage
import CoreText
import ImageIO
import CoreVideo

let inputPath = "/Users/cppeng/sop/productions/reference-fashion-grid.png"
let outputPath = "/Users/cppeng/sop/productions/color-card-fashion.mp4"
let width = 720
let height = 1280
let fps = 24
let secondsPerPose = 0.8
let cellW = 572
let cellH = 1010

struct Palette {
    let colors: [CGColor]
    let labels: [String]
    let codes: [String]
}

struct Swatch {
    let color: CGColor
    let name: String
    let code: String
}

func color(_ hex: UInt32) -> CGColor {
    CGColor(red: CGFloat((hex >> 16) & 255) / 255, green: CGFloat((hex >> 8) & 255) / 255, blue: CGFloat(hex & 255) / 255, alpha: 1)
}

let palettes = [
    Palette(colors: [color(0x272727), color(0xF0ECE4), color(0x7B202F)], labels: ["CHARCOAL", "SOFT IVORY", "OXBLOOD"], codes: ["#272727", "#F0ECE4", "#7B202F"]),
    Palette(colors: [color(0x2679D2), color(0x075E49), color(0x68473A)], labels: ["ROYAL BLUE", "FOREST GREEN", "COCOA BROWN"], codes: ["#2679D2", "#075E49", "#68473A"]),
    Palette(colors: [color(0xE35B32), color(0xF1EEE6), color(0xB7E5D5)], labels: ["BURNT ORANGE", "WARM IVORY", "MINT"], codes: ["#E35B32", "#F1EEE6", "#B7E5D5"]),
]
let library: [Swatch] = [
    Swatch(color: color(0xA9DCE2), name: "PALE AQUA", code: "13-4409 TCX"),
    Swatch(color: color(0x9CB3D0), name: "DUSTY BLUE", code: "15-3917 TCX"),
    Swatch(color: color(0xDF1029), name: "VERMILION", code: "18-1664 TCX"),
    Swatch(color: color(0xED6A3B), name: "TANGERINE", code: "16-1359 TCX"),
    Swatch(color: color(0xE5D159), name: "CITRUS", code: "13-0758 TCX"),
    Swatch(color: color(0xB5A4D2), name: "LILAC", code: "15-3817 TCX"),
    Swatch(color: color(0x8BCBB0), name: "MINT", code: "14-6330 TCX"),
    Swatch(color: color(0x32B3BC), name: "TURQUOISE", code: "15-5217 TCX"),
    Swatch(color: color(0xE47791), name: "ROSE", code: "17-1929 TCX"),
    Swatch(color: color(0xA456A0), name: "ORCHID", code: "18-3224 TCX"),
    Swatch(color: color(0x384B9A), name: "LAPIS", code: "19-4045 TCX"),
    Swatch(color: color(0x45719F), name: "DENIM", code: "18-4027 TCX"),
    Swatch(color: color(0xD8BE9B), name: "SAND", code: "13-1008 TCX"),
    Swatch(color: color(0xE84F3B), name: "TOMATO", code: "17-1563 TCX"),
    Swatch(color: color(0xF0DC54), name: "LEMON", code: "12-0752 TCX"),
    Swatch(color: color(0x1D927F), name: "JADE", code: "17-5734 TCX"),
    Swatch(color: color(0x564456), name: "PLUM", code: "19-1718 TCX"),
    Swatch(color: color(0xEE927C), name: "CORAL", code: "16-1546 TCX"),
]

func cgImage(from url: URL) -> CGImage {
    let source = CGImageSourceCreateWithURL(url as CFURL, nil)!
    return CGImageSourceCreateImageAtIndex(source, 0, nil)!
}

func maskedCell(_ source: CGImage, col: Int, row: Int) throws -> CGImage {
    let rect = CGRect(x: col * cellW, y: row * cellH, width: cellW, height: cellH)
    guard let crop = source.cropping(to: rect) else { throw NSError(domain: "crop", code: 1) }
    let request = VNGeneratePersonSegmentationRequest()
    request.qualityLevel = .accurate
    try VNImageRequestHandler(cgImage: crop).perform([request])
    guard let result = request.results?.first else { throw NSError(domain: "mask", code: 2) }
    let sourceCI = CIImage(cgImage: crop)
    let mask = CIImage(cvPixelBuffer: result.pixelBuffer).transformed(by: CGAffineTransform(scaleX: CGFloat(crop.width) / CGFloat(CVPixelBufferGetWidth(result.pixelBuffer)), y: CGFloat(crop.height) / CGFloat(CVPixelBufferGetHeight(result.pixelBuffer)))).cropped(to: sourceCI.extent)
    let blend = CIFilter(name: "CIBlendWithMask")!
    blend.setValue(sourceCI, forKey: kCIInputImageKey)
    blend.setValue(CIImage(color: .clear).cropped(to: sourceCI.extent), forKey: kCIInputBackgroundImageKey)
    blend.setValue(mask, forKey: kCIInputMaskImageKey)
    guard let ci = blend.outputImage else { throw NSError(domain: "mask-blend", code: 4) }
    let context = CIContext(options: [.useSoftwareRenderer: false])
    guard let image = context.createCGImage(ci, from: ci.extent) else { throw NSError(domain: "render-mask", code: 3) }
    return image
}

func cardPath(_ rect: CGRect, tooth: CGFloat = 4) -> CGPath {
    let path = CGMutablePath()
    let step: CGFloat = 11
    let p: CGFloat = 5
    path.move(to: CGPoint(x: rect.minX + p, y: rect.minY + p))
    var x = rect.minX + p
    while x < rect.maxX - p {
        path.addLine(to: CGPoint(x: min(x + step / 2, rect.maxX - p), y: rect.minY + p + tooth))
        path.addLine(to: CGPoint(x: min(x + step, rect.maxX - p), y: rect.minY + p))
        x += step
    }
    var y = rect.minY + p
    while y < rect.maxY - p {
        path.addLine(to: CGPoint(x: rect.maxX - p - tooth, y: min(y + step / 2, rect.maxY - p)))
        path.addLine(to: CGPoint(x: rect.maxX - p, y: min(y + step, rect.maxY - p)))
        y += step
    }
    x = rect.maxX - p
    while x > rect.minX + p {
        path.addLine(to: CGPoint(x: max(x - step / 2, rect.minX + p), y: rect.maxY - p - tooth))
        path.addLine(to: CGPoint(x: max(x - step, rect.minX + p), y: rect.maxY - p))
        x -= step
    }
    y = rect.maxY - p
    while y > rect.minY + p {
        path.addLine(to: CGPoint(x: rect.minX + p + tooth, y: max(y - step / 2, rect.minY + p)))
        path.addLine(to: CGPoint(x: rect.minX + p, y: max(y - step, rect.minY + p)))
        y -= step
    }
    path.closeSubpath()
    return path
}

func drawText(_ text: String, at point: CGPoint, size: CGFloat, in context: CGContext) {
    let font = CTFontCreateWithName("HelveticaNeue-Bold" as CFString, size, nil)
    let attributes: [NSAttributedString.Key: Any] = [
        NSAttributedString.Key(kCTFontAttributeName as String): font,
        NSAttributedString.Key(kCTForegroundColorAttributeName as String): CGColor(gray: 0.12, alpha: 0.9),
    ]
    let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: attributes))
    context.textPosition = point
    CTLineDraw(line, context)
}

func drawTicket(context: CGContext, center: CGPoint, size: CGSize, angle: CGFloat, fill: CGColor, label: String, code: String, opacity: CGFloat = 1, scale: CGFloat = 1) {
    context.saveGState()
    context.setAlpha(opacity)
    context.translateBy(x: center.x, y: center.y)
    context.rotate(by: angle)
    context.scaleBy(x: scale, y: scale)
    let rect = CGRect(x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height)
    let p: CGFloat = 5, shoulder: CGFloat = 65, step: CGFloat = 11, tooth: CGFloat = 5
    let path = CGMutablePath()
    path.move(to: CGPoint(x: rect.minX + p, y: rect.minY + p))
    path.addLine(to: CGPoint(x: rect.maxX - p, y: rect.minY + p))
    path.addLine(to: CGPoint(x: rect.maxX - p, y: rect.minY + shoulder))
    var y = rect.minY + shoulder
    while y < rect.maxY - p {
        path.addLine(to: CGPoint(x: rect.maxX - p - tooth, y: min(y + step / 2, rect.maxY - p)))
        path.addLine(to: CGPoint(x: rect.maxX - p, y: min(y + step, rect.maxY - p)))
        y += step
    }
    path.addLine(to: CGPoint(x: rect.minX + p, y: rect.maxY - p))
    y = rect.maxY - p
    while y > rect.minY + shoulder {
        path.addLine(to: CGPoint(x: rect.minX + p + tooth, y: max(y - step / 2, rect.minY + shoulder)))
        path.addLine(to: CGPoint(x: rect.minX + p, y: max(y - step, rect.minY + shoulder)))
        y -= step
    }
    path.addLine(to: CGPoint(x: rect.minX + p, y: rect.minY + p))
    path.closeSubpath()
    context.setShadow(offset: CGSize(width: 2, height: -6), blur: 10, color: CGColor(gray: 0, alpha: 0.2))
    context.addPath(path)
    context.setFillColor(CGColor(red: 0.985, green: 0.98, blue: 0.955, alpha: 1))
    context.fillPath()
    context.setShadow(offset: .zero, blur: 0)
    context.saveGState()
    context.addPath(path)
    context.clip()
    context.setFillColor(fill)
    context.fill(CGRect(x: rect.minX + p, y: rect.minY + shoulder, width: rect.width - 2 * p, height: rect.height - shoulder - p))
    context.setFillColor(CGColor(gray: 0.86, alpha: 1))
    context.fill(CGRect(x: rect.minX + p, y: rect.minY + shoulder, width: rect.width - 2 * p, height: 0.8))
    context.restoreGState()
    drawText(code, at: CGPoint(x: rect.minX + 10, y: rect.minY + 21), size: 9, in: context)
    drawText(label, at: CGPoint(x: rect.minX + 10, y: rect.minY + 42), size: 8, in: context)
    context.restoreGState()
}

func drawSlotCard(context: CGContext, center: CGPoint, size: CGSize, angle: CGFloat, swatch: Swatch, slot: Int, opacity: CGFloat = 1, scale: CGFloat = 1) {
    context.saveGState()
    context.setAlpha(opacity)
    context.translateBy(x: center.x, y: center.y)
    context.rotate(by: angle)
    context.scaleBy(x: scale, y: scale)
    let rect = CGRect(x: -size.width / 2, y: -size.height / 2, width: size.width, height: size.height)
    let p: CGFloat = 5, tooth: CGFloat = 4
    let path = cardPath(rect.insetBy(dx: -0, dy: -0), tooth: tooth)
    context.setShadow(offset: CGSize(width: 4, height: -7), blur: 13, color: CGColor(gray: 0, alpha: 0.22))
    context.addPath(path); context.setFillColor(swatch.color); context.fillPath()
    context.setShadow(offset: .zero, blur: 0)
    context.saveGState(); context.addPath(path); context.clip()
    let band: CGFloat = 48
    context.setFillColor(CGColor(red: 0.985, green: 0.98, blue: 0.955, alpha: 1))
    if slot == 0 { context.fill(CGRect(x: rect.maxX - band - p, y: rect.minY + p, width: band, height: rect.height - 2 * p)) }
    if slot == 1 { context.fill(CGRect(x: rect.minX + p, y: rect.minY + p, width: band, height: rect.height - 2 * p)) }
    if slot == 2 { context.fill(CGRect(x: rect.minX + p, y: rect.maxY - band - p, width: rect.width - 2 * p, height: band)) }
    context.restoreGState()
    context.setFillColor(CGColor(gray: 0.12, alpha: 0.95))
    if slot == 2 {
        drawText(swatch.name, at: CGPoint(x: rect.minX + rect.width * 0.48, y: rect.maxY - 29), size: 12, in: context)
        drawText(swatch.code, at: CGPoint(x: rect.minX + rect.width * 0.48, y: rect.maxY - 13), size: 10, in: context)
    } else {
        context.saveGState()
        let tx = slot == 0 ? rect.maxX - 29 : rect.minX + 29
        context.translateBy(x: tx, y: 0)
        context.rotate(by: slot == 0 ? .pi / 2 : -.pi / 2)
        drawText(swatch.name, at: CGPoint(x: -rect.height * 0.34, y: -3), size: 12, in: context)
        drawText(swatch.code, at: CGPoint(x: -rect.height * 0.34, y: 13), size: 10, in: context)
        context.restoreGState()
    }
    context.restoreGState()
}

let source = cgImage(from: URL(fileURLWithPath: inputPath))
var models: [CGImage] = []
for row in 0..<3 {
    for col in 0..<3 {
        models.append(try maskedCell(source, col: col, row: row))
    }
}

let ffmpeg = Process()
ffmpeg.executableURL = URL(fileURLWithPath: "/opt/homebrew/bin/ffmpeg")
ffmpeg.arguments = ["-y", "-f", "rawvideo", "-pixel_format", "bgra", "-video_size", "\(width)x\(height)", "-framerate", "\(fps)", "-i", "-", "-vf", "vflip", "-an", "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outputPath]
let pipe = Pipe()
ffmpeg.standardInput = pipe
ffmpeg.standardError = FileHandle.standardError
try ffmpeg.run()
let writer = pipe.fileHandleForWriting

let rowBytes = width * 4
let colorSpace = CGColorSpaceCreateDeviceRGB()
let byteCount = rowBytes * height
let totalFrames = Int(Double(fps) * secondsPerPose * 9)
let pageScale = CGFloat(height) / 860.0
let pageOffsetX = (CGFloat(width) - 431.0 * pageScale) / 2
let slotDefs: [(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, r: CGFloat)] = [
    (216, 134, 280, 226, -0.27), (217, 324, 276, 192, 0.24), (215, 510, 291, 194, -0.32),
]
let selectedFanSlots = [3, 6, 10]
let cycleDuration = secondsPerPose
func screenPoint(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
    CGPoint(x: pageOffsetX + x * pageScale, y: CGFloat(height) - y * pageScale)
}
func fanPoint(_ x: CGFloat, _ y: CGFloat) -> CGPoint {
    CGPoint(x: pageOffsetX + x * pageScale, y: y * pageScale)
}
func easeOut(_ value: Double) -> Double { 1 - pow(1 - min(1, max(0, value)), 3) }
func easeInOut(_ value: Double) -> Double {
    let v = min(1, max(0, value))
    return v < 0.5 ? 4 * v * v * v : 1 - pow(-2 * v + 2, 3) / 2
}
for frame in 0..<totalFrames {
    let totalTime = Double(frame) / Double(fps)
    let pose = min(8, Int(totalTime / secondsPerPose))
    let lookCycle = pose / 3
    let localTime = totalTime - Double(lookCycle) * secondsPerPose * 3
    let row = lookCycle
    let palette = palettes[row]
    let spinStart = 0.0
    let spinDuration = 1.25
    let spinDelta = 2 * Double.pi * 1.75
    let popStart = spinStart + spinDuration * 0.9
    let wheelRotation = spinDelta * easeInOut((localTime - spinStart) / spinDuration)
    let slotSwatches = (0..<3).map { Swatch(color: palette.colors[$0], name: palette.labels[$0], code: palette.codes[$0]) }
    let cycle = lookCycle
    var pixels = [UInt8](repeating: 255, count: byteCount)
    pixels.withUnsafeMutableBytes { raw in
        guard let base = raw.baseAddress,
              let ctx = CGContext(data: base, width: width, height: height, bitsPerComponent: 8, bytesPerRow: rowBytes, space: colorSpace, bitmapInfo: CGBitmapInfo.byteOrder32Little.rawValue | CGImageAlphaInfo.premultipliedFirst.rawValue) else { return }
        ctx.setFillColor(CGColor(red: 0.985, green: 0.98, blue: 0.965, alpha: 1))
        ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))

        let slotPoints = slotDefs.map { screenPoint($0.x, $0.y) }
        let slotSizes = slotDefs.map { CGSize(width: $0.w * pageScale, height: $0.h * pageScale) }
        if cycle > 0 {
            for index in 0..<3 {
                let age = localTime
                let p = CGFloat(easeInOut(age / 0.52))
                let sourceIndex = selectedFanSlots[index]
                let fanAngle = Double(sourceIndex) / 32 * 2 * Double.pi + wheelRotation
                let fanCenter = fanPoint(215 + CGFloat(sin(fanAngle)) * 147, 968 - CGFloat(cos(fanAngle)) * 147)
                let source = slotDefs[index]
                let start = slotPoints[index]
                let center = CGPoint(x: start.x + (fanCenter.x - start.x) * p, y: start.y + (fanCenter.y - start.y) * p)
                let sourceRotation = -CGFloat(fanAngle)
                let angle = -source.r + (sourceRotation + source.r) * p
                drawSlotCard(context: ctx, center: center, size: slotSizes[index], angle: angle, swatch: slotSwatches[index], slot: index, opacity: 1 - p, scale: 1 - 0.38 * p)
            }
        }

        // The 32-card wheel and its selected replacement cards follow the source page's geometry.
        for index in 0..<32 {
            let angle = Double(index) / 32 * 2 * Double.pi + wheelRotation
            let center = fanPoint(215 + CGFloat(sin(angle)) * 147, 968 - CGFloat(cos(angle)) * 147)
            let swatch: Swatch
            if let selectedIndex = selectedFanSlots.firstIndex(of: index) { swatch = slotSwatches[selectedIndex] }
            else { swatch = library[index % library.count] }
            drawTicket(context: ctx, center: center, size: CGSize(width: 62 * pageScale, height: 280 * pageScale), angle: -CGFloat(angle), fill: swatch.color, label: swatch.name, code: swatch.code)
        }

        for index in 0..<3 {
            let elapsed = localTime - popStart - Double(index) * 0.09
            let p = CGFloat(easeInOut(elapsed / 0.9))
            let fanAngle = Double(selectedFanSlots[index]) / 32 * 2 * Double.pi + wheelRotation
            let sourcePoint = fanPoint(215 + CGFloat(sin(fanAngle)) * 147, 968 - CGFloat(cos(fanAngle)) * 147)
            let targetPoint = slotPoints[index]
            let center = CGPoint(x: sourcePoint.x + (targetPoint.x - sourcePoint.x) * p, y: sourcePoint.y + (targetPoint.y - sourcePoint.y) * p - sin(p * .pi) * 38 * pageScale)
            let angle = -CGFloat(fanAngle) + (-slotDefs[index].r + CGFloat(fanAngle)) * p
            let flyerAlpha = CGFloat(easeInOut(elapsed / 0.28)) * (1 - CGFloat(easeInOut((elapsed - 0.48) / 0.32)))
            let flipScale = 1 - 0.09 * abs(sin(p * .pi))
            drawTicket(context: ctx, center: center, size: CGSize(width: 62 * pageScale, height: 280 * pageScale), angle: angle, fill: slotSwatches[index].color, label: slotSwatches[index].name, code: slotSwatches[index].code, opacity: flyerAlpha, scale: flipScale)
        }

        for index in 0..<3 {
            let elapsed = localTime - popStart - Double(index) * 0.09
            let settleInput = min(1, max(0, (elapsed - 0.42) / 0.52))
            let p = CGFloat(min(1, max(0, easeOut(settleInput) + 0.008 * sin(settleInput * Double.pi * 4) * (1 - settleInput))))
            let float = CGFloat(sin(totalTime * 1.1 + Double(index) * 1.5)) * 2.5 * pageScale
            let slot = slotDefs[index]
            let position = screenPoint(slot.x + CGFloat(sin(totalTime * 1.1 + Double(index) * 1.5)) * 2.5, slot.y + CGFloat(cos(totalTime * 0.9 + Double(index)) * 2))
            let alpha = CGFloat(easeInOut((elapsed - 0.38) / 0.34))
            let angle = -slot.r - (1 - p) * 0.055 * CGFloat(index - 1)
            drawSlotCard(context: ctx, center: CGPoint(x: position.x, y: position.y + float), size: slotSizes[index], angle: angle, swatch: slotSwatches[index], slot: index, opacity: alpha, scale: 0.9 + 0.1 * p)
        }

        ctx.saveGState()
        ctx.translateBy(x: 0, y: CGFloat(height))
        ctx.scaleBy(x: 1, y: -1)
        let model = models[pose]
        let scale = max(CGFloat(width) / CGFloat(model.width), CGFloat(height) / CGFloat(model.height))
        let drawW = CGFloat(model.width) * scale
        let drawH = CGFloat(model.height) * scale
        let dest = CGRect(x: (CGFloat(width) - drawW) / 2, y: (CGFloat(height) - drawH) / 2, width: drawW, height: drawH)
        ctx.draw(model, in: dest)
        ctx.restoreGState()
    }
    writer.write(Data(bytes: pixels, count: byteCount))
}
try writer.close()
ffmpeg.waitUntilExit()
if ffmpeg.terminationStatus != 0 { throw NSError(domain: "ffmpeg", code: Int(ffmpeg.terminationStatus)) }
print("Rendered \(outputPath) (\(totalFrames) frames, 9 model poses)")
