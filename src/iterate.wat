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
)
