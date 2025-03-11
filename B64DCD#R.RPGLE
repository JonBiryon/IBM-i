**free
///
// @Program......: B64DEC#R
// @Description..: Decode a Base64 string
// @Author.......: Jonathan Shalem
// @Creation date: 26/Sep/2024
// @Last update..: 11/Mar/2025
///
// Decoding from base64 features converting each base64 character into its
//  6-bit number, then combining every four 6-bit part strings into a 24-bit
//  string and dividing it into three bytes(8-bit parts) each of which which
//  is a decoded character.
///
// Reverse character maps translate the numeric value of each character into
//  the correct Base64 character to be read as its 6-bit representation of:
//  ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/
///
// Output data size ought to be 3/4-X times the input data size, where X is 1 or 0.
///
// Prototype to copy:
// dcl-pr B64DEC#R extpgm;
//    *n pointer const; // Input (base64-encoded) string adddress
//    *n uns(10) const; // Input string length
//    *n pointer const; // Output decoded string (3/4 times the input length)
//    *n uns(10)       options(*omit:*nopass); // (Returned) Output data length
//    *n ind     const options(*nopass); // Use EBCDIC char-table instead of UTF-8
// end-pr;

/////---------------------------\\\\\
  /// --- Compiler options: --- \\\
/////---------------------------\\\\\
   ctl-opt option(*nodebugio);

/////--------------------\\\\\
  /// --- Interface: --- \\\
/////--------------------\\\\\
   dcl-pi *n;
      p_inp pointer const; // Input (base64-encoded) string adddress
      p_inpLen uns(10) const; // Input string length
      p_out pointer const; // Output (decoded) string address (3/4 times the input length)
      p_outLen uns(10) options(*omit:*nopass); // (Returned) Output data length
      p_isEBCDIC ind const options(*nopass); // Use EBCDIC char-table instead of UTF-8
   end-pi;

/////--------------------\\\\\
  /// --- Variables: --- \\\
/////--------------------\\\\\
   dcl-s b64DecodeMap int(3) dim(*auto:172);
   dcl-s inpRef pointer;
   dcl-s outRef pointer;
   dcl-s i uns(10) inz;
   dcl-s c uns(3) dim(4) based(inpRef); // Input character
   dcl-s bp uns(3) dim(4); // Bit-parts
   dcl-s oc uns(3) dim(3) based(outRef); // Encoded (output) char number
   dcl-s isEBCDIC ind;
   dcl-s offset uns(3) inz(42); // 42 for ASCII, 77 for EBCDIC
   dcl-s eqSign uns(3) inz(61); // 61 for ASCII, 126 for EBCDIC
   dcl-s lenOffset uns(3) inz;


/////---------------\\\\\
  /// --- Main: --- \\\
/////---------------\\\\\
   exsr $Init;
   exsr $Decode;
   exsr $End;


/////----------------------\\\\\
  /// --- Subroutines: --- \\\
/////----------------------\\\\\
   begsr $Init;
     /// Check input integriity:
      if p_inp = *null;
         snd-msg %msg('CPF9898':'QCPFMSG':'Null input pointer');
         exsr $End;
      elseif p_out = *null;
         snd-msg %msg('CPF9898':'QCPFMSG':'Null output pointer');
         exsr $End;
      elseif %str(p_inp) = *blanks;
         snd-msg %msg('CPF9898':'QCPFMSG':'Blank input');
         exsr $End;
      endif;

      if %addr(p_isEBCDIC) <> *null;
         isEBCDIC = p_isEBCDIC;
      endif;

     // Reverse character map ASCII+43 or EBCDIC+78 to base64:
      if isEBCDIC;
         eqSign = 126;
         offset = 77;
         b64DecodeMap = %list(
            62:-1:-1:-1:-1:-1:-1:-1:-1:-1:
            -1:-1:-1:-1:-1:-1:-1:-1:63:-1:
            -1:-1:-1:-1:-1:-1:-1:-1:-1:-1:
            -1:-1:-1:-1:-1:-1:-1:-1:-1:-1:
            -1:-1:-1:-1:-1:-1:-1:-1:-1:-1:
            -1:26:27:28:29:30:31:32:33:34:
            -1:-1:-1:-1:-1:-1:-1:35:36:37:
            38:39:40:41:42:43:-1:-1:-1:-1:
            -1:-1:-1:-1:44:45:46:47:48:49:
            50:51:-1:-1:-1:-1:-1:-1:-1:-1:
            -1:-1:-1:-1:-1:-1:-1:-1:-1:-1:
            -1:-1:-1:-1:-1: 0: 1: 2: 3: 4:
             5: 6: 7: 8:-1:-1:-1:-1:-1:-1:
            -1: 9:10:11:12:13:14:15:16:17:
            -1:-1:-1:-1:-1:-1:-1:-1:18:19:
            20:21:22:23:24:25:-1:-1:-1:-1:
            -1:-1:52:53:54:55:56:57:58:59:
            60:61
         );
      else;
//       eqSign = 61;
//       offset = 42;
         b64DecodeMap = %list(
            62:-1:-1:-1:63:52:53:54:55:56:
            57:58:59:60:61:-1:-1:-1:-1:-1:
            -1:-1: 0: 1: 2: 3: 4: 5: 6: 7:
             8: 9:10:11:12:13:14:15:16:17:
            18:19:20:21:22:23:24:25:-1:-1:
            -1:-1:-1:-1:26:27:28:29:30:31:
            32:33:34:35:36:37:38:39:40:41:
            42:43:44:45:46:47:48:49:50:51
         );
      endif;

      inpRef = p_inp;
      outRef = p_out;
   endsr; //$Init

/// ======================================================================== \\\

   begsr $Decode;
      for i = 1 to p_inpLen by 4;
         if c(1) <= offset or c(1) > %elem(b64DecodeMap) + offset;
            snd-msg *info 'Misfit character at position ' + %char(i);
            leave;
         endif;

        // First char output, made of input chars 1 and 2:
         bp(1) = b64DecodeMap(c(1) - offset); // First char input
         bp(2) = b64DecodeMap(c(2) - offset); // Second char input
         oc(1) = bp(1) * 4 + %uns(bp(2) / 16); // 00xxxxxx<< + 00xx0000>>>>

        // Seond char output, made of input chars 2 and 3:
         if c(3) = eqSign; // ASCII 61, EBCDIC 126
            bp(3) = 0;
            lenOffset = 1; // Encoded string ends with '==', decrease decoded length by 1.
         else;
            bp(3) = b64DecodeMap(c(3) - offset); // Third char input
         endif;
         oc(2) = %bitand(bp(2):15) * 16 + bp(3) / 4; // 0000xxxx<<<< + 00xxxx00>>

        // Third char output, made of input chars 3 and 4. Skip if 3rd input is '=':
         if c(3) <> eqSign;
            if c(4) = eqSign; // ASCII 61, EBCDIC 126
               bp(4) = 0;
            else;
               bp(4) = b64DecodeMap(c(4) - offset);// Fourth char input
            endif;
            oc(3) = %bitand(bp(3):3) * 64 + bp(4); // 000000xx<<<<<< + 00xxxxxx
         endif;

         inpRef += 4; // Point to the next 4 input characters
         outRef += 3; // Point to the next 3 decoded characters
      endfor;

      if %addr(p_outLen) <> *null;
         p_outLen = i * 3 / 4 - lenOffset;
      endif;
   endsr; //$Decode

/// ======================================================================== \\\

   begsr $End;
      *inlr = *on;
      return;
   endsr; //$End 
