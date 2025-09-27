const fs = require('fs');

function parseClass(input) {
  // normalize to DataView
  let bytes;
  if (input instanceof DataView) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new DataView(input);
  } else if (input instanceof Uint8Array) {
    bytes = new DataView(input.buffer, input.byteOffset, input.byteLength);
  } else if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) {
    // Node Buffer
    const arr = new Uint8Array(input);
    bytes = new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
  } else {
    throw new TypeError('Unsupported input type: expected Buffer, ArrayBuffer, Uint8Array, or DataView');
  }

  let pos = 0;
  const readU1 = () => { const v = bytes.getUint8(pos); pos += 1; return v; };
  const readU2 = () => { const v = bytes.getUint16(pos, false); pos += 2; return v; };
  const readU4 = () => { const v = bytes.getUint32(pos, false); pos += 4; return v; };
  const readS1 = () => { const v = bytes.getInt8(pos); pos += 1; return v; };
  const readS2 = () => { const v = bytes.getInt16(pos, false); pos += 2; return v; };
  const readBytes = (n) => { const out = new Uint8Array(bytes.buffer, bytes.byteOffset + pos, n); pos += n; return out; };
  const readUtf8 = (n) => {
    const arr = readBytes(n);
    // decode UTF-8
    try {
      return new TextDecoder('utf-8').decode(arr);
    } catch (e) {
      // fallback
      let s = '';
      for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
      return s;
    }
  };

  // header
  const magic = readU4();
  if (magic !== 0xCAFEBABE) throw new Error('Invalid class file: wrong magic');
  const minor = readU2();
  const major = readU2();

  // constant pool
  const cpCount = readU2();
  const cp = new Array(cpCount);
  // tags: 1=Utf8,3=Integer,4=Float,5=Long,6=Double,7=Class,8=String,9=Fieldref,10=Methodref,
  // 11=InterfaceMethodref,12=NameAndType,15=MethodHandle,16=MethodType,18=InvokeDynamic
  for (let i = 1; i < cpCount; i++) {
    const tag = readU1();
    const entry = { tag };
    switch (tag) {
      case 1: // Utf8
        const len = readU2();
        entry.value = readUtf8(len);
        break;
      case 3: // Integer
        entry.value = readU4() | 0;
        break;
      case 4: // Float
        entry.value = bytes.getFloat32(pos, false); pos += 4; break;
      case 5: // Long
        // read two u4s -> combine
        const high = readU4(), low = readU4();
        entry.value = (BigInt(high) << 32n) | BigInt(low);
        cp[i] = entry;
        i++; // long/double take two cp entries
        continue;
      case 6: // Double
        entry.value = bytes.getFloat64(pos, false); pos += 8; break;
      case 7: // Class
        entry.name_index = readU2(); break;
      case 8: // String
        entry.string_index = readU2(); break;
      case 9: // Fieldref
      case 10: // Methodref
      case 11: // InterfaceMethodref
        entry.class_index = readU2();
        entry.name_and_type_index = readU2();
        break;
      case 12: // NameAndType
        entry.name_index = readU2();
        entry.descriptor_index = readU2();
        break;
      case 15: // MethodHandle
        entry.reference_kind = readU1();
        entry.reference_index = readU2();
        break;
      case 16: // MethodType
        entry.descriptor_index = readU2();
        break;
      case 18: // InvokeDynamic
        entry.bootstrap_method_attr_index = readU2();
        entry.name_and_type_index = readU2();
        break;
      default:
        throw new Error('Unknown constant pool tag: ' + tag + ' at index ' + i);
    }
    cp[i] = entry;
  }

  const accessFlags = readU2();
  const thisClass = readU2();
  const superClass = readU2();
  const interfacesCount = readU2();
  const interfaces = [];
  for (let i = 0; i < interfacesCount; i++) interfaces.push(readU2());

  const fieldsCount = readU2();
  const fields = [];
  for (let i = 0; i < fieldsCount; i++) {
    const f = {};
    f.access_flags = readU2();
    f.name_index = readU2();
    f.descriptor_index = readU2();
    const attributes_count = readU2();
    f.attributes = [];
    for (let a = 0; a < attributes_count; a++) {
      const attr_name_index = readU2();
      const attr_len = readU4();
      const info = readBytes(attr_len);
      f.attributes.push({ name_index: attr_name_index, length: attr_len, info });
    }
    fields.push(f);
  }

  const methodsCount = readU2();
  const methods = [];
  for (let i = 0; i < methodsCount; i++) {
    const m = {};
    m.access_flags = readU2();
    m.name_index = readU2();
    m.descriptor_index = readU2();
    const attributes_count = readU2();
    m.attributes = [];
    for (let a = 0; a < attributes_count; a++) {
      const name_index = readU2();
      const attr_len = readU4();
      const infoBytes = readBytes(attr_len);
      m.attributes.push({ name_index, length: attr_len, info: infoBytes });
    }
    methods.push(m);
  }

  const attributesCount = readU2();
  const attributes = [];
  for (let i = 0; i < attributesCount; i++) {
    const name_index = readU2();
    const attr_len = readU4();
    const info = readBytes(attr_len);
    attributes.push({ name_index, length: attr_len, info });
  }

  // helpers to resolve CP entries
  const cpTagName = (tag) => {
    const names = {1:'Utf8',3:'Integer',4:'Float',5:'Long',6:'Double',7:'Class',8:'String',9:'Fieldref',10:'Methodref',11:'InterfaceMethodref',12:'NameAndType',15:'MethodHandle',16:'MethodType',18:'InvokeDynamic'};
    return names[tag] || ('Tag'+tag);
  };
  const cpUtf8 = (idx) => (idx && cp[idx] && cp[idx].tag === 1) ? cp[idx].value : ('#' + idx);
  const resolveClassName = (idx) => cpUtf8(cp[idx].name_index);
  const resolveNameAndType = (idx) => {
    const nt = cp[idx];
    if (!nt) return '#'+idx;
    return `${cpUtf8(nt.name_index)}:${cpUtf8(nt.descriptor_index)}`;
  };
  const resolveMemberRef = (idx) => {
    const r = cp[idx];
    if (!r) return '#'+idx;
    const className = cpUtf8(cp[r.class_index].name_index);
    const nt = cp[r.name_and_type_index];
    const name = cpUtf8(nt.name_index);
    const desc = cpUtf8(nt.descriptor_index);
    return `${className}.${name}${desc}`;
  };

  // opcode table (mnemonic + operand format)
  // operand formats: 'u1','u2','s1','s2','cp' (u2 cp index), 'bytearray(n)'
  // special opcodes (tableswitch/lookupswitch/wide) handled separately
  const OPCODES = (function(){
    const map = {};
    const op = (code, mnemonic, operands) => map[code] = { mnemonic, operands: operands || [] };
    // a subset of opcodes commonly used (reasonable coverage)
    op(0x00,'nop');
    op(0x01,'aconst_null');
    op(0x02,'iconst_m1');
    op(0x03,'iconst_0'); op(0x04,'iconst_1'); op(0x05,'iconst_2'); op(0x06,'iconst_3'); op(0x07,'iconst_4'); op(0x08,'iconst_5');
    op(0x09,'lconst_0'); op(0x0a,'lconst_1');
    op(0x0b,'fconst_0'); op(0x0c,'fconst_1'); op(0x0d,'fconst_2');
    op(0x0e,'dconst_0'); op(0x0f,'dconst_1');
    op(0x10,'bipush',['s1']);
    op(0x11,'sipush',['s2']);
    op(0x12,'ldc',['u1']); // index to cp (string/int/float)
    op(0x13,'ldc_w',['u2']); op(0x14,'ldc2_w',['u2']);
    op(0x15,'iload',['u1']); op(0x16,'lload',['u1']); op(0x17,'fload',['u1']); op(0x18,'dload',['u1']); op(0x19,'aload',['u1']);
    op(0x1a,'iload_0'); op(0x1b,'iload_1'); op(0x1c,'iload_2'); op(0x1d,'iload_3');
    op(0x1e,'lload_0'); op(0x1f,'lload_1'); op(0x20,'lload_2'); op(0x21,'lload_3');
    op(0x22,'fload_0'); op(0x23,'fload_1'); op(0x24,'fload_2'); op(0x25,'fload_3');
    op(0x26,'dload_0'); op(0x27,'dload_1'); op(0x28,'dload_2'); op(0x29,'dload_3');
    op(0x2a,'aload_0'); op(0x2b,'aload_1'); op(0x2c,'aload_2'); op(0x2d,'aload_3');
    op(0x2e,'iaload'); op(0x2f,'laload'); op(0x30,'faload'); op(0x31,'daload'); op(0x32,'aaload'); op(0x33,'baload'); op(0x34,'caload'); op(0x35,'saload');
    op(0x36,'istore',['u1']); op(0x37,'lstore',['u1']); op(0x38,'fstore',['u1']); op(0x39,'dstore',['u1']); op(0x3a,'astore',['u1']);
    op(0x3b,'istore_0'); op(0x3c,'istore_1'); op(0x3d,'istore_2'); op(0x3e,'istore_3');
    op(0x3f,'lstore_0'); op(0x40,'lstore_1'); op(0x41,'lstore_2'); op(0x42,'lstore_3');
    op(0x43,'fstore_0'); op(0x44,'fstore_1'); op(0x45,'fstore_2'); op(0x46,'fstore_3');
    op(0x47,'dstore_0'); op(0x48,'dstore_1'); op(0x49,'dstore_2'); op(0x4a,'dstore_3');
    op(0x4b,'astore_0'); op(0x4c,'astore_1'); op(0x4d,'astore_2'); op(0x4e,'astore_3');
    op(0x4f,'iastore'); op(0x50,'lastore'); op(0x51,'fastore'); op(0x52,'dastore'); op(0x53,'aastore'); op(0x54,'bastore'); op(0x55,'castore'); op(0x56,'sastore');
    op(0x57,'pop'); op(0x58,'pop2'); op(0x59,'dup'); op(0x5a,'dup_x1'); op(0x5b,'dup_x2'); op(0x5c,'dup2'); op(0x5d,'dup2_x1'); op(0x5e,'dup2_x2'); op(0x5f,'swap');
    op(0x60,'iadd'); op(0x61,'ladd'); op(0x62,'fadd'); op(0x63,'dadd');
    op(0x64,'isub'); op(0x65,'lsub'); op(0x66,'fsub'); op(0x67,'dsub');
    op(0x68,'imul'); op(0x69,'lmul'); op(0x6a,'fmul'); op(0x6b,'dmul');
    op(0x6c,'idiv'); op(0x6d,'ldiv'); op(0x6e,'fdiv'); op(0x6f,'ddiv');
    op(0x70,'irem'); op(0x71,'lrem'); op(0x72,'frem'); op(0x73,'drem');
    op(0x74,'ineg'); op(0x75,'lneg'); op(0x76,'fneg'); op(0x77,'dneg');
    op(0x78,'ishl'); op(0x79,'lshl'); op(0x7a,'ishr'); op(0x7b,'lshr'); op(0x7c,'iushr'); op(0x7d,'lushr');
    op(0x7e,'iand'); op(0x7f,'land'); op(0x80,'ior'); op(0x81,'lor'); op(0x82,'ixor'); op(0x83,'lxor');
    op(0x84,'iinc',['u1','s1']); // local var index + const
    op(0x85,'i2l'); op(0x86,'i2f'); op(0x87,'i2d'); op(0x88,'l2i'); op(0x89,'l2f'); op(0x8a,'l2d');
    op(0x8b,'f2i'); op(0x8c,'f2l'); op(0x8d,'f2d'); op(0x8e,'d2i'); op(0x8f,'d2l'); op(0x90,'d2f');
    op(0x91,'i2b'); op(0x92,'i2c'); op(0x93,'i2s');
    op(0x94,'lcmp'); op(0x95,'fcmpl'); op(0x96,'fcmpg'); op(0x97,'dcmpl'); op(0x98,'dcmpg');
    // branches
    op(0x99,'ifeq',['s2']); op(0x9a,'ifne',['s2']); op(0x9b,'iflt',['s2']); op(0x9c,'ifge',['s2']); op(0x9d,'ifgt',['s2']); op(0x9e,'ifle',['s2']);
    op(0x9f,'if_icmpeq',['s2']); op(0xa0,'if_icmpne',['s2']); op(0xa1,'if_icmplt',['s2']); op(0xa2,'if_icmpge',['s2']); op(0xa3,'if_icmpgt',['s2']); op(0xa4,'if_icmple',['s2']);
    op(0xa5,'if_acmpeq',['s2']); op(0xa6,'if_acmpne',['s2']);
    op(0xa7,'goto',['s2']); op(0xa8,'jsr',['s2']); op(0xa9,'ret',['u1']);
    op(0xaa,'tableswitch'); op(0xab,'lookupswitch');
    op(0xac,'ireturn'); op(0xad,'lreturn'); op(0xae,'freturn'); op(0xaf,'dreturn'); op(0xb0,'areturn'); op(0xb1,'return');
    op(0xb2,'getstatic',['u2']); op(0xb3,'putstatic',['u2']); op(0xb4,'getfield',['u2']); op(0xb5,'putfield',['u2']);
    op(0xb6,'invokevirtual',['u2']); op(0xb7,'invokespecial',['u2']); op(0xb8,'invokestatic',['u2']); op(0xb9,'invokeinterface',['u2','u1','u1']);
    op(0xba,'invokedynamic',['u2','u1','u1']);
    op(0xbb,'new',['u2']); op(0xbc,'newarray',['u1']); op(0xbd,'anewarray',['u2']); op(0xbe,'arraylength'); op(0xbf,'athrow');
    op(0xc0,'checkcast',['u2']); op(0xc1,'instanceof',['u2']); op(0xc2,'monitorenter'); op(0xc3,'monitorexit');
    op(0xc4,'wide'); // special handling
    op(0xc5,'multianewarray',['u2','u1']); op(0xc6,'ifnull',['s2']); op(0xc7,'ifnonnull',['s2']);
    op(0xc8,'goto_w',['s4']); op(0xc9,'jsr_w',['s4']);
    // 0xca reserved, and newer ones (invokedynamic variants) omitted for brevity
    return map;
  })();

  // disassemble code byte array into array of instruction objects
  function disassemble(codeBytes) {
    const view = new DataView(codeBytes.buffer, codeBytes.byteOffset, codeBytes.byteLength);
    let p = 0;
    const out = [];
    while (p < view.byteLength) {
      const offset = p;
      const opcode = view.getUint8(p++);
      const info = OPCODES[opcode] || null;
      // handle wide prefix
      if (opcode === 0xc4) { // wide
        const op2 = view.getUint8(p++);
        const wideInfo = OPCODES[op2] || null;
        if (!wideInfo) {
          out.push({ offset, opcode, mnemonic: 'wide (unknown)', raw: [op2] });
          continue;
        }
        // wide usually modifies following instruction's operand sizes:
        // iload, fload, aload, lload, dload, istore, fstore, astore, lstore, dstore, ret => index is u2 instead of u1
        // iinc => index u2, const s2
        if (op2 === 0x84) { // iinc wide
          const index = view.getUint16(p, false); p += 2;
          const constVal = view.getInt16(p, false); p += 2;
          out.push({ offset, opcode: 0xc4, mnemonic: 'wide iinc', operands: [index, constVal] });
        } else {
          const index = view.getUint16(p, false); p += 2;
          out.push({ offset, opcode: 0xc4, mnemonic: 'wide ' + (OPCODES[op2] ? OPCODES[op2].mnemonic : ('op0x'+op2.toString(16))), operands: [index] });
        }
        continue;
      }

      if (opcode === 0xaa) { // tableswitch
        // align to 4-byte boundary after opcode
        const pad = (4 - ((offset + 1) % 4)) % 4;
        p += pad;
        const defaultByte = view.getInt32(p, false); p += 4;
        const low = view.getInt32(p, false); p += 4;
        const high = view.getInt32(p, false); p += 4;
        const n = high - low + 1;
        const jumps = [];
        for (let i = 0; i < n; i++) {
          const off = view.getInt32(p, false); p += 4;
          jumps.push(off);
        }
        out.push({ offset, opcode, mnemonic: 'tableswitch', default: defaultByte, low, high, jumps, size: p - offset });
        continue;
      }

      if (opcode === 0xab) { // lookupswitch
        const pad = (4 - ((offset + 1) % 4)) % 4;
        p += pad;
        const defaultByte = view.getInt32(p, false); p += 4;
        const npairs = view.getInt32(p, false); p += 4;
        const pairs = [];
        for (let i = 0; i < npairs; i++) {
          const match = view.getInt32(p, false); p += 4;
          const off = view.getInt32(p, false); p += 4;
          pairs.push([match, off]);
        }
        out.push({ offset, opcode, mnemonic: 'lookupswitch', default: defaultByte, npairs, pairs, size: p - offset });
        continue;
      }

      if (opcode === 0xba) { // invokedynamic (has two u1 bytes after u2 in modern classfiles: 0,0)
        // our table specified u2 u1 u1 -- follow that
      }

      // normal operand decoding
      if (!info) {
        // unknown opcode => just push raw hex
        out.push({ offset, opcode, mnemonic: 'op_' + opcode.toString(16), raw: [] });
        continue;
      }
      const operands = [];
      for (const fmt of info.operands) {
        if (fmt === 'u1') {
          const v = view.getUint8(p); p += 1; operands.push(v);
        } else if (fmt === 's1') {
          const v = view.getInt8(p); p += 1; operands.push(v);
        } else if (fmt === 'u2') {
          const v = view.getUint16(p, false); p += 2; operands.push(v);
        } else if (fmt === 's2') {
          const v = view.getInt16(p, false); p += 2; operands.push(v);
        } else if (fmt === 's4') {
          const v = view.getInt32(p, false); p += 4; operands.push(v);
        } else {
          // unsupported format; skip
        }
      }
      out.push({ offset, opcode, mnemonic: info.mnemonic, operands, size: undefined });
    }
    return out;
  }

  // helper to pretty-print cp references
  function cpRefString(idx) {
    if (!idx || idx >= cp.length) return '#' + idx;
    const entry = cp[idx];
    if (!entry) return '#'+idx;
    switch (entry.tag) {
      case 1: return `"${entry.value}"`;
      case 7: return `Class(${cpUtf8(entry.name_index)})`;
      case 8: return `String(${cpUtf8(entry.string_index)})`;
      case 9: case 10: case 11:
        return `${cpUtf8(cp[entry.class_index].name_index)}.${cpUtf8(cp[entry.name_and_type_index].name_index)}${cpUtf8(cp[entry.name_and_type_index].descriptor_index)} (#${idx})`;
      case 12:
        return `${cpUtf8(entry.name_index)}:${cpUtf8(entry.descriptor_index)}`;
      case 3: case 4: case 5: case 6:
        return String(entry.value);
      case 15:
        return `MethodHandle(kind=${entry.reference_kind}, ref=#${entry.reference_index})`;
      case 16:
        return `MethodType(${cpUtf8(entry.descriptor_index)})`;
      case 18:
        return `InvokeDynamic(bsm=${entry.bootstrap_method_attr_index}, nt=${resolveNameAndType(entry.name_and_type_index)})`;
      default:
        return `cp#${idx}`;
    }
  }

  // parse attribute info bytes (for methods we need Code attribute)
  function parseAttributes(attrArray) {
    const parsed = [];
    for (const a of attrArray) {
      const name = cpUtf8(a.name_index);
      const info = a.info; // Uint8Array
      if (name === 'Code') {
        // parse Code attribute
        const dv = new DataView(info.buffer, info.byteOffset, info.byteLength);
        let p2 = 0;
        const readU2b = () => { const v = dv.getUint16(p2, false); p2 += 2; return v; };
        const readU4b = () => { const v = dv.getUint32(p2, false); p2 += 4; return v; };
        const max_stack = readU2b();
        const max_locals = readU2b();
        const code_length = readU4b();
        const codeBytes = new Uint8Array(info.buffer, info.byteOffset + p2, code_length);
        p2 += code_length;
        const exception_table_length = readU2b();
        const exceptions = [];
        for (let i = 0; i < exception_table_length; i++) {
          const start_pc = readU2b(); const end_pc = readU2b(); const handler_pc = readU2b(); const catch_type = readU2b();
          exceptions.push({ start_pc, end_pc, handler_pc, catch_type });
        }
        const attributes_count = readU2b();
        const subattrs = [];
        for (let i = 0; i < attributes_count; i++) {
          const sub_name_index = readU2b(); const sub_len = readU4b();
          const sub_info = new Uint8Array(info.buffer, info.byteOffset + p2, sub_len);
          p2 += sub_len;
          subattrs.push({ name_index: sub_name_index, length: sub_len, info: sub_info });
        }
        parsed.push({ name, max_stack, max_locals, code_length, codeBytes, exceptions, attributes: subattrs });
      } else {
        parsed.push({ name, raw: info });
      }
    }
    return parsed;
  }

  // assemble output
  const lines = [];
  lines.push(`Classfile (major=${major}, minor=${minor})`);
  lines.push(`Access flags: 0x${accessFlags.toString(16)}`);
  lines.push(`This class: ${cpUtf8(cp[thisClass].name_index)} (${thisClass})`);
  lines.push(`Super class: ${superClass ? cpUtf8(cp[superClass].name_index) : 'none'} (${superClass})`);
  if (interfaces.length) {
    lines.push(`Interfaces: ${interfaces.map(i=>cpUtf8(cp[i].name_index)).join(', ')}`);
  }
  lines.push('');
  // constant pool summary (show important entries)
  lines.push(`Constant pool (${cpCount-1} entries):`);
  for (let i = 1; i < cpCount; i++) {
    const e = cp[i];
    if (!e) { lines.push(`#${i}: <skip> (long/double continuation)`); continue; }
    const tagName = cpTagName(e.tag);
    let detail = '';
    switch (e.tag) {
      case 1: detail = `"${e.value}"`; break;
      case 7: detail = `Class ${cpUtf8(e.name_index)}`; break;
      case 8: detail = `String ${cpUtf8(e.string_index)}`; break;
      case 9: case 10: case 11:
        detail = resolveMemberRef(i); break;
      case 12:
        detail = resolveNameAndType(i); break;
      case 3: case 4: case 5: case 6:
        detail = String(e.value); break;
      default:
        detail = JSON.stringify(e);
    }
    lines.push(`#${i} = ${tagName} ${detail}`);
  }
  lines.push('');

  // fields
  lines.push(`Fields (${fields.length}):`);
  for (const f of fields) {
    lines.push(`  - ${cpUtf8(f.name_index)} : ${cpUtf8(f.descriptor_index)} (flags: 0x${f.access_flags.toString(16)})`);
  }
  lines.push('');

  // methods: show signature and disassembled code if present
  lines.push(`Methods (${methods.length}):`);
  for (const m of methods) {
    const name = cpUtf8(m.name_index);
    const desc = cpUtf8(m.descriptor_index);
    lines.push(`  - ${name}${desc}  (flags: 0x${m.access_flags.toString(16)})`);
    const parsedAttrs = parseAttributes(m.attributes);
    for (const pa of parsedAttrs) {
      if (pa.name === 'Code') {
        lines.push(`      Code: max_stack=${pa.max_stack}, max_locals=${pa.max_locals}, code_length=${pa.code_length}`);
        // disassemble
        try {
          const insns = disassemble(pa.codeBytes);
          for (const ins of insns) {
            // format operands with cp resolution when applicable
            let opsText = '';
            if (ins.operands && ins.operands.length) {
              const opParts = ins.operands.map((o, idx) => {
                // heuristics: many operands reference cp if opcode expects u2 cp index or u1 for ldc
                if (ins.mnemonic && /ldc/.test(ins.mnemonic) && idx === 0) {
                  // ldc uses u1 or u2 pointer to constant pool — show cpRef
                  return `#${o}=${cpRefString(o)}`;
                }
                if (ins.mnemonic && /(getstatic|putstatic|getfield|putfield|invokevirtual|invokespecial|invokestatic|invokeinterface|invokedynamic|new|checkcast|instanceof|anewarray|multianewarray)/.test(ins.mnemonic)) {
                  if (idx === 0) return `#${o}=${cpRefString(o)}`;
                }
                if (typeof o === 'number') return String(o);
                return String(o);
              });
              opsText = ' ' + opParts.join(', ');
            }
            // tableswitch and lookupswitch pretty printing
            if (ins.mnemonic === 'tableswitch') {
              lines.push(`        ${ins.offset.toString().padStart(4,' ')}: ${ins.mnemonic} default=${ins.default} low=${ins.low} high=${ins.high}`);
              ins.jumps.forEach((j,i)=> lines.push(`             ${ins.low + i} -> ${ins.offset + j}`));
              continue;
            }
            if (ins.mnemonic === 'lookupswitch') {
              lines.push(`        ${ins.offset.toString().padStart(4,' ')}: ${ins.mnemonic} default=${ins.default} pairs=${ins.npairs}`);
              ins.pairs.forEach(p => lines.push(`             ${p[0]} -> ${ins.offset + p[1]}`));
              continue;
            }
            // wide special
            if (ins.mnemonic && ins.mnemonic.startsWith('wide')) {
              lines.push(`        ${ins.offset.toString().padStart(4,' ')}: ${ins.mnemonic} ${ins.operands ? ins.operands.join(', ') : ''}`);
              continue;
            }
            lines.push(`        ${ins.offset.toString().padStart(4,' ')}: ${ins.mnemonic}${opsText}`);
          }
        } catch (e) {
          lines.push(`        <error disassembling code: ${e.message}>`);
        }
      } else {
        // other attributes for method
        lines.push(`      Attribute: ${pa.name} (len=${pa.raw ? pa.raw.length : 'n/a'})`);
      }
    }
  }
  lines.push('');
  lines.push(`Attributes (${attributes.length}):`);
  for (const a of attributes) {
    lines.push(`  - ${cpUtf8(a.name_index)} (len=${a.length})`);
  }

  return lines.join('\n');
}

module.exports = {parse: parseClass}