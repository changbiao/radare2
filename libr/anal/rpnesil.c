/* radare - LGPL - Copyright 2014 - pancake */

#include <r_anal.h>

static int esil_reg_write (RAnalEsil *esil, const char *dst, ut64 num);
static int esil_reg_read (RAnalEsil *esil, const char *regname, ut64 *num);

R_API RAnalEsil *r_anal_esil_new() {
	RAnalEsil *esil = R_NEW0 (RAnalEsil);
	esil->stackptr = 0;
	return esil;
}

R_API void r_anal_esil_free (RAnalEsil *esil) {
	int i;
	for (i=0; i<esil->stackptr;i++)
		free (esil->stack[i]);
	free (esil);
}

static int internal_esil_mem_read(RAnalEsil *esil, ut64 addr, ut8 *buf, int len) {
	if (!esil || !esil->anal || !esil->anal->iob.io)
		return 0;
	return esil->anal->iob.read_at (esil->anal->iob.io, addr, buf, len);
}

static int esil_mem_read(RAnalEsil *esil, ut64 addr, ut8 *buf, int len) {
	int i, ret = 0;
	if (!buf || !esil)
		return 0;
	if (esil->hook_mem_read) {
		ret = esil->hook_mem_read (esil, addr, buf, len);
	}
	if (!ret && esil->mem_read) {
		ret = esil->mem_read (esil, addr, buf, len);
	}
	if (esil->debug) {
		eprintf ("0x%08"PFMT64x" R> ", addr);
		for (i=0;i<len;i++)
			eprintf ("%02x", buf[i]);
		eprintf ("\n");
	}
	return ret;
}

static int internal_esil_mem_write (THIS *esil, ut64 addr, const ut8 *buf, int len) {
	if (!esil || !esil->anal || !esil->anal->iob.io)
		return 0;
	return esil->anal->iob.write_at (esil->anal->iob.io, addr, buf, len);
}

static int esil_mem_write (THIS *esil, ut64 addr, const ut8 *buf, int len) {
	int i, ret = 0;
	if (!buf || !esil)
		return 0;
	if (esil->debug) {
		eprintf ("0x%08"PFMT64x" <W ", addr);
		for (i=0;i<len;i++)
			eprintf ("%02x", buf[i]);
		eprintf ("\n");
	}
	if (esil->hook_mem_write) {
		ret = esil->hook_mem_write (esil, addr, buf, len);
	}
	if (!ret && esil->mem_write) {
		ret = esil->mem_write (esil, addr, buf, len);
	}
	return ret;
}

static int internal_esil_reg_read(RAnalEsil *esil, const char *regname, ut64 *num) {
	RRegItem *reg = r_reg_get (esil->anal->reg, regname, -1);
	if (reg) {
		if (num)
			*num = r_reg_get_value (esil->anal->reg, reg);
		return 1;
	}
	return 0;
}

static int internal_esil_reg_write(RAnalEsil *esil, const char *regname, ut64 num) {
	RRegItem *reg = r_reg_get (esil->anal->reg, regname, -1);
	if (reg) {
		r_reg_set_value (esil->anal->reg, reg, num);
		return 1;
	}
	return 0;
}

R_API int r_anal_esil_setup (RAnalEsil *esil, RAnal *anal) {
	// register callbacks using this anal module.
	// this is: set
	esil->debug = 1;
	esil->anal = anal;
	//esil->user = NULL;
	esil->reg_read = internal_esil_reg_read;
	esil->reg_write = internal_esil_reg_write;
	esil->mem_read = internal_esil_mem_read;
	esil->mem_write = internal_esil_mem_write;
	return 1;
}

R_API int r_anal_esil_pushnum(RAnalEsil *esil, ut64 num) {
	char str[64];
	snprintf (str, sizeof (str)-1, "0x%"PFMT64x, num);
	return r_anal_esil_push (esil, str);
}

R_API int r_anal_esil_push(RAnalEsil *esil, const char *str) {
	if (!str || !esil || !*str || esil->stackptr>30)
		return 0;
	esil->stack[esil->stackptr++] = strdup (str);
	return 1;
}

R_API char *r_anal_esil_pop(RAnalEsil *esil) {
	if (esil->stackptr<1)
		return NULL;
	return esil->stack[--esil->stackptr];
}

static int isnum (RAnalEsil *esil, const char *str, ut64 *num) {
	if (*str >= '0' && *str <= '9') {
		if (num)
			*num = r_num_get (NULL, str);
		return 1;
	}
	if (num)
		*num = 0;
	return 0;
}

static int isregornum(RAnalEsil *esil, const char *str, ut64 *num) {
	if (!esil_reg_read (esil, str, num))
		if (!isnum (esil, str, num))
			return 0;
	return 1;
}

static int esil_reg_write (RAnalEsil *esil, const char *dst, ut64 num) {
	int ret = 0;
	if (esil->debug) {
		eprintf ("%s=0x%"PFMT64x"\n", dst, num);
	}
	if (esil->hook_reg_write) {
		ret = esil->hook_reg_write (esil, dst, num);
		if (!ret)
			return ret;	
	}
	if (esil->reg_write) {
		return esil->reg_write (esil, dst, num);
	}
	return ret;
}

static int esil_reg_read (RAnalEsil *esil, const char *regname, ut64 *num) {
	int ret = 0;
	if (num)
		*num = 0LL;
	if (esil->hook_reg_read) {
		ret = esil->hook_reg_read (esil, regname, num);
	}
	if (!ret && esil->reg_read) {
		ret = esil->reg_read (esil, regname, num);
	}
	if (ret && num && esil->debug) {
		eprintf ("%s=0x%"PFMT64x"\n", regname, *num);
	}
	return ret;
}

static int esil_eq (RAnalEsil *esil) {
	int ret = 0;
	ut64 num;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (src && dst && esil_reg_read (esil, dst, NULL)) {
		if (isregornum (esil, src, &num))
			ret = esil_reg_write (esil, dst, num);
		else eprintf ("esil_eq: invalid src\n");
	} else {
		eprintf ("esil_eq: invalid parameters\n");
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_ask(RAnalEsil *esil) {
	ut64 num, cmpn;
	char *cnt = r_anal_esil_pop (esil);
	char *cmp = r_anal_esil_pop (esil);
	if (cnt && isregornum (esil, cnt, &num)) {
		if (cmp && isregornum (esil, cmp, &cmpn)) {
			if (!cmpn) esil->skip = num;
		}
	}
	return 1;
}

static int esil_neg(RAnalEsil *esil) {
	int ret = 0;
	ut64 num;
	char *src = r_anal_esil_pop (esil);
	if (src && isregornum (esil, src, &num)) {
		num = !num;
		r_anal_esil_pushnum (esil, num);
		ret = 1;
	} else {
		eprintf ("esil_neg: empty stack\n");
	}
	free (src);
	return ret;
}

static int esil_andeq(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, num2;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (dst && esil_reg_read (esil, dst, &num)) {
		if (src && isregornum (esil, src, &num2)) {
			num &= num2;
			esil_reg_write (esil, dst, num);
			ret = 1;
		} else {
			eprintf ("esil_neg: empty stack\n");
		}
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_lsl(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, num2;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (dst && esil_reg_read (esil, dst, &num)) {
		if (src && isregornum (esil, src, &num2)) {
			num <<= num2;
			r_anal_esil_pushnum (esil, num);
			ret = 1;
		} else {
			eprintf ("esil_neg: empty stack\n");
		}
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_lsleq(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, num2;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (dst && esil_reg_read (esil, dst, &num)) {
		if (src && isregornum (esil, src, &num2)) {
			num <<= num2;
			esil_reg_write (esil, dst, num);
			ret = 1;
		} else {
			eprintf ("esil_neg: empty stack\n");
		}
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_lsr(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, num2;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (dst && esil_reg_read (esil, dst, &num)) {
		if (src && isregornum (esil, src, &num2)) {
			num >>= num2;
			r_anal_esil_pushnum (esil, num);
			ret = 1;
		} else {
			eprintf ("esil_neg: empty stack\n");
		}
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_lsreq(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, num2;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (dst && esil_reg_read (esil, dst, &num)) {
		if (src && isregornum (esil, src, &num2)) {
			num >>= num2;
			esil_reg_write (esil, dst, num);
			ret = 1;
		} else {
			eprintf ("esil_neg: empty stack\n");
		}
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_and(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, num2;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (dst && esil_reg_read (esil, dst, &num)) {
		if (src && isregornum (esil, src, &num2)) {
			num &= num2;
			r_anal_esil_pushnum (esil, num);
			ret = 1;
		} else {
			eprintf ("esil_neg: empty stack\n");
		}
	}
	free (src);
	free (dst);
	return ret;
}

R_API int r_anal_esil_dumpstack (RAnalEsil *esil) {
	int i;
	if (esil->stackptr<1) 
		return 0;
	eprintf ("StackDump:\n");
	for (i=esil->stackptr-1;i>=0; i--) {
		eprintf (" [%d] %s\n", i, esil->stack[i]);
	}
	return 1;
}

static int esil_div(RAnalEsil *esil) {
	int ret = 0;
	ut64 s, d;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (src && isregornum (esil, src, &s)) {
		if (dst && isregornum (esil, dst, &d)) {
// TODO: check overflow
			if (s == 0) {
				eprintf ("esil_div: Division by zero!\n");
			} else  {
				r_anal_esil_pushnum (esil, d/s);
			}
		}
	} else {
		eprintf ("esil_eq: invalid parameters");
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_mul(RAnalEsil *esil) {
	int ret = 0;
	ut64 s, d;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (src && isregornum (esil, src, &s)) {
		if (dst && isregornum (esil, dst, &d)) {
// TODO: check overflow
			r_anal_esil_pushnum (esil, d*s);
		}
	} else {
		eprintf ("esil_eq: invalid parameters");
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_add (RAnalEsil *esil) {
	int ret = 0;
	ut64 s, d;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (src && isregornum (esil, src, &s)) {
		if (dst && isregornum (esil, dst, &d)) {
// TODO: check overflow
			r_anal_esil_pushnum (esil, d+s);
		}
	} else {
		eprintf ("esil_eq: invalid parameters");
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_addeq (RAnalEsil *esil) {
	int ret = 0;
	ut64 s, d;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
// src -= dst;
// src = src - dst;
	if (src && isregornum (esil, src, &s)) {
		if (dst && isregornum (esil, dst, &d)) {
			esil_reg_write (esil, dst, s+d);
		}
	} else {
		eprintf ("esil_eq: invalid parameters");
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_sub (RAnalEsil *esil) {
	int ret = 0;
	ut64 s, d;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (src && isregornum (esil, src, &s)) {
		if (dst && isregornum (esil, dst, &d)) {
// TODO: check overflow
			r_anal_esil_pushnum (esil, s-d);
		}
	} else {
		eprintf ("esil_eq: invalid parameters");
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_subeq (RAnalEsil *esil) {
	int ret = 0;
	ut64 s, d;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
// src -= dst;
// src = src - dst;
	if (src && isregornum (esil, src, &s)) {
		if (dst && isregornum (esil, dst, &d)) {
			esil_reg_write (esil, dst, s-d);
		}
	} else {
		eprintf ("esil_eq: invalid parameters");
	}
	free (src);
	free (dst);
	return ret;
}

static int esil_poke4(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, addr;
	ut32 num4;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (src && isregornum (esil, src, &num)) {
		if (dst && isregornum (esil, dst, &addr)) {
			num4 = (ut32)num;
			ret = esil_mem_write (esil, addr,
				(const ut8*)&num4, 4);
		}
	}
	return ret;
}

static int esil_peek1(RAnalEsil *esil) {
	int ret = 0;
	char res[32];
	ut64 num;
	char *dst = r_anal_esil_pop (esil);
	if (dst && isregornum (esil, dst, &num)) {
		ut8 buf;
		ret = esil_mem_read (esil, num, &buf, 1);
		snprintf (res, sizeof (res), "0x%x", buf);
		r_anal_esil_push (esil, res);
	}
	return ret;
}

static int esil_peek4(RAnalEsil *esil) {
	int ret = 0;
	char res[32];
	ut64 num;
	char *dst = r_anal_esil_pop (esil);
	if (dst && isregornum (esil, dst, &num)) {
		ut8 buf[4];
		ut32 *n32 = (ut32 *)&buf;
		ret = esil_mem_read (esil, num, buf, 4);
		snprintf (res, sizeof (res), "0x%x", *n32);
		r_anal_esil_push (esil, res);
	}
	return ret;
}

static int esil_peek(RAnalEsil *esil) {
	switch (esil->anal->bits) {
	//case 64: return esil_peek8 (esil);
	case 32: return esil_peek4 (esil);
	//case 16: return esil_peek2 (esil);
	//case 8: return esil_peek1 (esil);
	}
	return 0;
}

static int esil_poke8(RAnalEsil *esil) {
	int ret = 0;
	ut64 num, addr;
	ut64 num8;
	char *dst = r_anal_esil_pop (esil);
	char *src = r_anal_esil_pop (esil);
	if (src && isregornum (esil, src, &num)) {
		if (dst && isregornum (esil, dst, &addr)) {
			num8 = (ut64)num;
			ret = esil_mem_write (esil, addr,
				(const ut8*)&num8, sizeof (num8));
		}
	}
	return ret;
}

static int esil_peek8(RAnalEsil *esil) {
	int ret = 0;
	char res[32];
	ut64 num;
	char *dst = r_anal_esil_pop (esil);
	if (dst && isregornum (esil, dst, &num)) {
		ut8 buf[8];
		ut64 *n64 = (ut64 *)&buf;
		ret = esil_mem_read (esil, num, buf, sizeof (ut64));
		snprintf (res, sizeof (res), "0x%"PFMT64x, *n64);
		r_anal_esil_push (esil, res);
	}
	return ret;
}
typedef int RAnalEsilCmd(RAnalEsil *esil);

static int iscommand (RAnalEsil *esil, const char *word, RAnalEsilCmd **cmd) {
//TODO: use RCmd here?
	if (!strcmp (word, "<<")) { *cmd = &esil_lsl; return 1; } else
	if (!strcmp (word, "<<=")) { *cmd = &esil_lsleq; return 1; } else
	if (!strcmp (word, ">>")) { *cmd = &esil_lsr; return 1; } else
	if (!strcmp (word, ">>=")) { *cmd = &esil_lsreq; return 1; } else
	if (!strcmp (word, "&")) { *cmd = &esil_and; return 1; } else
	if (!strcmp (word, "&=")) { *cmd = &esil_andeq; return 1; } else
	if (!strcmp (word, "!")) { *cmd = &esil_neg; return 1; } else
	if (!strcmp (word, "?")) { *cmd = &esil_ask; return 1; } else
	if (!strcmp (word, "=")) { *cmd = &esil_eq; return 1; } else
	if (!strcmp (word, "*")) { *cmd = &esil_mul; return 1; } else
	if (!strcmp (word, "+")) { *cmd = &esil_add; return 1; } else
	if (!strcmp (word, "+=")) { *cmd = &esil_addeq; return 1; } else
	if (!strcmp (word, "-")) { *cmd = &esil_sub; return 1; } else
	if (!strcmp (word, "-=")) { *cmd = &esil_subeq; return 1; } else
	if (!strcmp (word, "/")) { *cmd = &esil_div; return 1; } else
	if (!strcmp (word, "=[4]")) { *cmd = &esil_poke4; return 1; } else
	if (!strcmp (word, "=[8]")) { *cmd = &esil_poke8; return 1; } else
	if (!strcmp (word, "[1]")) { *cmd = &esil_peek1; return 1; } else
	if (!strcmp (word, "[4]")) { *cmd = &esil_peek4; return 1; } else
	if (!strcmp (word, "[8]")) { *cmd = &esil_peek8; return 1; } else
	if (!strcmp (word, "[]")) { *cmd = &esil_peek; return 1; } else {
	}
	return 0;
}

static int runword (RAnalEsil *esil, const char *word) {
	RAnalEsilCmd *cmd = NULL;
	if (esil->skip) {
		esil->skip--;
		return 0;
	}
	if (iscommand (esil, word, &cmd)) {
		// run action
		if (cmd)
			return cmd (esil);
	}
	// push value
	r_anal_esil_push (esil, word);
	return 0;
}

R_API int r_anal_esil_parse(RAnalEsil *esil, const char *str) {
	// split str by commas
	int wordi = 0;
	char word[32];
	while (*str) {
		if (wordi>30) {
			eprintf ("Invalid esil string\n");
			return -1;
		}
		if (*str == ',') {
			word[wordi] = 0;
			wordi = 0;
			runword (esil, word);
			str++;
		}
		word[wordi++] = *str;
		str++;
	}
	word[wordi] = 0;
	runword (esil, word);
	return 0;
}

R_API int r_anal_esil_register_cmd() {
	// TODO: register new commands
	return 0;
}