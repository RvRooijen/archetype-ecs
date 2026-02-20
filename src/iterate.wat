(module
  (memory (import "env" "memory") 1)

  ;; Scalar loop: px[i] += vx[i]; py[i] += vy[i]
  ;; params: byte offsets for px, py, vx, vy arrays + element count
  (func (export "iterate_scalar")
    (param $px i32) (param $py i32) (param $vx i32) (param $vy i32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        ;; px[i] += vx[i]
        (f32.store
          (i32.add (local.get $px) (local.get $off))
          (f32.add
            (f32.load (i32.add (local.get $px) (local.get $off)))
            (f32.load (i32.add (local.get $vx) (local.get $off)))
          )
        )
        ;; py[i] += vy[i]
        (f32.store
          (i32.add (local.get $py) (local.get $off))
          (f32.add
            (f32.load (i32.add (local.get $py) (local.get $off)))
            (f32.load (i32.add (local.get $vy) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop)
      )
    )
  )

  ;; SIMD loop: processes 4 floats at a time using v128 / f32x4
  (func (export "iterate_simd")
    (param $px i32) (param $py i32) (param $vx i32) (param $vy i32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local $end4 i32)
    ;; end4 = count & ~3 (round down to multiple of 4)
    (local.set $end4 (i32.and (local.get $count) (i32.const -4)))
    ;; SIMD loop: 4 elements per iteration
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $end4)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        ;; px[i..i+4] += vx[i..i+4]
        (v128.store
          (i32.add (local.get $px) (local.get $off))
          (f32x4.add
            (v128.load (i32.add (local.get $px) (local.get $off)))
            (v128.load (i32.add (local.get $vx) (local.get $off)))
          )
        )
        ;; py[i..i+4] += vy[i..i+4]
        (v128.store
          (i32.add (local.get $py) (local.get $off))
          (f32x4.add
            (v128.load (i32.add (local.get $py) (local.get $off)))
            (v128.load (i32.add (local.get $vy) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )
    ;; Scalar remainder
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (f32.store
          (i32.add (local.get $px) (local.get $off))
          (f32.add
            (f32.load (i32.add (local.get $px) (local.get $off)))
            (f32.load (i32.add (local.get $vx) (local.get $off)))
          )
        )
        (f32.store
          (i32.add (local.get $py) (local.get $off))
          (f32.add
            (f32.load (i32.add (local.get $py) (local.get $off)))
            (f32.load (i32.add (local.get $vy) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )
  )

  ;; Generic f32 add: dst[i] += src[i], SIMD 4-wide + scalar remainder
  (func (export "add_f32")
    (param $dst i32) (param $src i32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local $end4 i32)
    (local.set $end4 (i32.and (local.get $count) (i32.const -4)))
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $end4)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (v128.store
          (i32.add (local.get $dst) (local.get $off))
          (f32x4.add
            (v128.load (i32.add (local.get $dst) (local.get $off)))
            (v128.load (i32.add (local.get $src) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (f32.store
          (i32.add (local.get $dst) (local.get $off))
          (f32.add
            (f32.load (i32.add (local.get $dst) (local.get $off)))
            (f32.load (i32.add (local.get $src) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )
  )

  ;; Generic f32 sub: dst[i] -= src[i], SIMD 4-wide + scalar remainder
  (func (export "sub_f32")
    (param $dst i32) (param $src i32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local $end4 i32)
    (local.set $end4 (i32.and (local.get $count) (i32.const -4)))
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $end4)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (v128.store
          (i32.add (local.get $dst) (local.get $off))
          (f32x4.sub
            (v128.load (i32.add (local.get $dst) (local.get $off)))
            (v128.load (i32.add (local.get $src) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (f32.store
          (i32.add (local.get $dst) (local.get $off))
          (f32.sub
            (f32.load (i32.add (local.get $dst) (local.get $off)))
            (f32.load (i32.add (local.get $src) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )
  )

  ;; Generic f32 mul: dst[i] *= src[i], SIMD 4-wide + scalar remainder
  (func (export "mul_f32")
    (param $dst i32) (param $src i32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local $end4 i32)
    (local.set $end4 (i32.and (local.get $count) (i32.const -4)))
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $end4)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (v128.store
          (i32.add (local.get $dst) (local.get $off))
          (f32x4.mul
            (v128.load (i32.add (local.get $dst) (local.get $off)))
            (v128.load (i32.add (local.get $src) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (f32.store
          (i32.add (local.get $dst) (local.get $off))
          (f32.mul
            (f32.load (i32.add (local.get $dst) (local.get $off)))
            (f32.load (i32.add (local.get $src) (local.get $off)))
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )
  )

  ;; random_f32: dst[i] = min + rand * range, LCG SIMD 4-wide + scalar remainder
  ;; state: byte offset of 16-byte PRNG state (4x i32, one per SIMD lane)
  ;; range = max - min (pre-computed by caller)
  (func (export "random_f32")
    (param $dst i32) (param $state i32) (param $min f32) (param $range f32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local $end4 i32)
    (local $s v128)
    (local $mult v128)
    (local $inc v128)
    (local $vscale v128)
    (local $vmin v128)
    (local $vrange v128)
    (local $r v128)
    (local $st0 i32)
    (local.set $mult   (i32x4.splat (i32.const 1664525)))
    (local.set $inc    (i32x4.splat (i32.const 1013904223)))
    (local.set $vscale (f32x4.splat (f32.const 0x1p-24)))
    (local.set $vmin   (f32x4.splat (local.get $min)))
    (local.set $vrange (f32x4.splat (local.get $range)))
    (local.set $s      (v128.load   (local.get $state)))
    (local.set $end4   (i32.and (local.get $count) (i32.const -4)))
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $end4)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        ;; LCG step (all 4 lanes)
        (local.set $s (i32x4.add (i32x4.mul (local.get $s) (local.get $mult)) (local.get $inc)))
        ;; Convert to f32 [min, max): (s >> 8) * (1/2^24) * range + min
        (local.set $r
          (f32x4.add
            (f32x4.mul
              (f32x4.mul
                (f32x4.convert_i32x4_u (i32x4.shr_u (local.get $s) (i32.const 8)))
                (local.get $vscale))
              (local.get $vrange))
            (local.get $vmin)))
        (v128.store (i32.add (local.get $dst) (local.get $off)) (local.get $r))
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )
    (v128.store (local.get $state) (local.get $s))
    ;; Scalar remainder — step lane 0 of state
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (local.set $st0
          (i32.add (i32.mul (i32.load (local.get $state)) (i32.const 1664525)) (i32.const 1013904223)))
        (i32.store (local.get $state) (local.get $st0))
        (f32.store
          (i32.add (local.get $dst) (local.get $off))
          (f32.add
            (f32.mul
              (f32.mul
                (f32.convert_i32_u (i32.shr_u (local.get $st0) (i32.const 8)))
                (f32.const 0x1p-24))
              (local.get $range))
            (local.get $min)))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )
  )

  ;; add_random_f32: dst[i] = src[i] + min + rand * range, LCG SIMD 4-wide + scalar remainder
  (func (export "add_random_f32")
    (param $dst i32) (param $src i32) (param $state i32) (param $min f32) (param $range f32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local $end4 i32)
    (local $s v128)
    (local $mult v128)
    (local $inc v128)
    (local $vscale v128)
    (local $vmin v128)
    (local $vrange v128)
    (local $r v128)
    (local $st0 i32)
    (local.set $mult   (i32x4.splat (i32.const 1664525)))
    (local.set $inc    (i32x4.splat (i32.const 1013904223)))
    (local.set $vscale (f32x4.splat (f32.const 0x1p-24)))
    (local.set $vmin   (f32x4.splat (local.get $min)))
    (local.set $vrange (f32x4.splat (local.get $range)))
    (local.set $s      (v128.load   (local.get $state)))
    (local.set $end4   (i32.and (local.get $count) (i32.const -4)))
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $end4)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        ;; LCG step (all 4 lanes)
        (local.set $s (i32x4.add (i32x4.mul (local.get $s) (local.get $mult)) (local.get $inc)))
        ;; rand = (s >> 8) * (1/2^24) * range + min, then add src[i]
        (local.set $r
          (f32x4.add
            (f32x4.add
              (f32x4.mul
                (f32x4.mul
                  (f32x4.convert_i32x4_u (i32x4.shr_u (local.get $s) (i32.const 8)))
                  (local.get $vscale))
                (local.get $vrange))
              (local.get $vmin))
            (v128.load (i32.add (local.get $src) (local.get $off)))))
        (v128.store (i32.add (local.get $dst) (local.get $off)) (local.get $r))
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )
    (v128.store (local.get $state) (local.get $s))
    ;; Scalar remainder — step lane 0 of state
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (local.set $st0
          (i32.add (i32.mul (i32.load (local.get $state)) (i32.const 1664525)) (i32.const 1013904223)))
        (i32.store (local.get $state) (local.get $st0))
        (f32.store
          (i32.add (local.get $dst) (local.get $off))
          (f32.add
            (f32.add
              (f32.mul
                (f32.mul
                  (f32.convert_i32_u (i32.shr_u (local.get $st0) (i32.const 8)))
                  (f32.const 0x1p-24))
                (local.get $range))
              (local.get $min))
            (f32.load (i32.add (local.get $src) (local.get $off)))))
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )
  )

  ;; Scale f32: dst[i] *= scalar, SIMD 4-wide + scalar remainder
  (func (export "scale_f32")
    (param $dst i32) (param $scalar f32) (param $count i32)
    (local $i i32)
    (local $off i32)
    (local $end4 i32)
    (local $splat v128)
    (local.set $splat (f32x4.splat (local.get $scalar)))
    (local.set $end4 (i32.and (local.get $count) (i32.const -4)))
    (local.set $i (i32.const 0))
    (block $break
      (loop $loop
        (br_if $break (i32.ge_u (local.get $i) (local.get $end4)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (v128.store
          (i32.add (local.get $dst) (local.get $off))
          (f32x4.mul
            (v128.load (i32.add (local.get $dst) (local.get $off)))
            (local.get $splat)
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 4)))
        (br $loop)
      )
    )
    (block $break2
      (loop $loop2
        (br_if $break2 (i32.ge_u (local.get $i) (local.get $count)))
        (local.set $off (i32.shl (local.get $i) (i32.const 2)))
        (f32.store
          (i32.add (local.get $dst) (local.get $off))
          (f32.mul
            (f32.load (i32.add (local.get $dst) (local.get $off)))
            (local.get $scalar)
          )
        )
        (local.set $i (i32.add (local.get $i) (i32.const 1)))
        (br $loop2)
      )
    )
  )
)
